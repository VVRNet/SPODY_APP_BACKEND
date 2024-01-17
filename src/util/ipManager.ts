import {
    DescribeTargetHealthCommand,
    DescribeTargetHealthCommandOutput,
    ElasticLoadBalancingV2Client,
    TargetHealthStateEnum,
} from '@aws-sdk/client-elastic-load-balancing-v2'
import { Env } from './env'
import { ExError } from './error'
import { SlackSendServerError } from './slack'

const FargateMetadataUrl = process.env.ECS_CONTAINER_METADATA_URI_V4

let clusterIps: string[] = []

export const IpManagerClusterIps = (): readonly string[] => {
    return clusterIps
}

export const IpManagerStart = async () => {
    const targetGroupArn = Env().targetGroupArn
    if (FargateMetadataUrl == null) {
        console.log('not fargate env. ipManager not work.')
        return
    }
    const awsElbClient = new ElasticLoadBalancingV2Client({
        region: Env().region,
    })
    let localIps: string[] = []
    while (true) {
        if (localIps.length < 1) {
            localIps = await getLocalIps() ?? []
        }
        const healthyIps = await getHealthyIps(awsElbClient, targetGroupArn)
        if (localIps != null && healthyIps != null) {
            clusterIps = healthyIps.filter((i) => !localIps.includes(i))
        }
        await new Promise((f) => setTimeout(f, 30000))
    }
}

const getHealthyIps = async (
    awsElbClient: ElasticLoadBalancingV2Client,
    targetGroupArn: string,
): Promise<string[] | null> => {
    let res: DescribeTargetHealthCommandOutput
    try {
        res = await awsElbClient.send(
            new DescribeTargetHealthCommand({
                TargetGroupArn: targetGroupArn,
            }),
        )
        if (!Array.isArray(res.TargetHealthDescriptions)) {
            throw new ExError('wrong aws info', {
                type: 'int',
                code: 'AWS_ALB_GET_WRONG',
                info: {
                    targetGroup: targetGroupArn,
                },
            })
        }
    } catch (e) {
        const exErr = ExError.isExError(e) ? e : new ExError('wrong aws info', {
            type: 'int',
            code: 'AWS_ALB_GET_ERROR',
            info: {
                targetGroup: targetGroupArn,
            },
            err: e,
        })
        if (Env().env !== 'local') {
            await SlackSendServerError(exErr)
        } else {
            console.log(exErr)
        }
        return null
    }

    return res.TargetHealthDescriptions.filter((t) => t.TargetHealth?.State === TargetHealthStateEnum.HEALTHY).map(
        (t) => t.Target?.Id,
    ).filter((t): t is string => t != null)
}

const getLocalIps = async (): Promise<string[] | null> => {
    if (FargateMetadataUrl == null) {
        return null
    }
    let metaData: any = {}
    try {
        metaData = await ((await fetch(FargateMetadataUrl, { method: 'GET' })).json())
        return metaData.Networks.map((n: any) => n.IPv4Addresses).flat()
    } catch (e) {
        const exErr = new ExError('fail to local ip', {
            type: 'int',
            code: 'IPWORKER_FAILED',
            info: { metaData: JSON.stringify(metaData) }
        })
        if (Env().env !== 'local') {
            await SlackSendServerError(exErr)
        } else {
            console.log(exErr)
        }
        return null
    }
}
