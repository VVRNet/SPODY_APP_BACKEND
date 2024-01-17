import { CollAgreement, SchemaAgreement } from '../../db/agreement'
import { ExError } from '../../util/error'

export const AgreementGetLastest = async (
  language?: string,
): Promise<{
  service?: SchemaAgreement
  privacy?: SchemaAgreement
  marketing?: SchemaAgreement
}> => {
  let aggrements = await getAggrementForLanguage(language ?? 'en')
  if (aggrements == null && language != null) {
    aggrements = await getAggrementForLanguage('en')
  }

  if (aggrements == null) {
    throw new ExError('no existed aggrements', {
      type: 'int',
      code: 'DB_GET_LATEST_AGREEMENT_NOT_AVAILABLE',
    })
  }
  return aggrements
}

const getAggrementForLanguage = async (
  language: string,
): Promise<{
  service?: SchemaAgreement
  privacy?: SchemaAgreement
  marketing?: SchemaAgreement
} | null> => {
  let agreements: SchemaAgreement[]
  try {
    agreements = await CollAgreement.aggregate<SchemaAgreement>([
      { $match: { language: language } },
      { $sort: { version: -1 } }, // 버전을 내림차순으로 정렬
      { $group: { _id: '$type', doc: { $first: '$$ROOT' } } }, // type별로 첫 번째 문서 선택
      { $replaceRoot: { newRoot: '$doc' } }, // 선택된 문서를 루트로 변경
    ]).toArray()
  } catch (e) {
    throw new ExError('failed to get agreement', {
      type: 'int',
      code: 'DB_GET_LATEST_AGREEMENT',
      err: e,
    })
  }

  const service = agreements.find((a) => a.type === 'service')
  const privacy = agreements.find((a) => a.type === 'privacy')
  const marketing = agreements.find((a) => a.type === 'marketing')

  return service == null && privacy == null && marketing == null
    ? null
    : {
        service: service,
        privacy: privacy,
        marketing: marketing,
      }
}