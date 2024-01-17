#!/bin/sh

set -e
set -v

export ECS_TASK_DEFINITION_NAME=${ENV}-api
export SPEC_CPU=${TASK_CPU}
export SPEC_MEM=${TASK_MEM}
export REPO_DOMAIN=224713359600.dkr.ecr.ap-northeast-2.amazonaws.com
export REPO_URL=spody-api
export IMAGE_TAG=${BUILD_NUMBER}
export REGION=ap-northeast-2
export ENV=${ENV}
export ROLE_TASK=${ENV}-api-task-role
export ROLE_EXEC=ecsTaskExecutionRole
export LOG_GROUP=${ENV}-spody-api

echo ${TASK_PATH}
ls -al ${TASK_PATH}

export TASK_JSON=$(cat ${TASK_PATH}/taskDefinition.json)
export TASK_JSON=$(echo ${TASK_JSON} | sed "s/__MODULE__/${ECS_TASK_DEFINITION_NAME}/g")
export TASK_JSON=$(echo ${TASK_JSON} | sed "s/__CPU__/${SPEC_CPU}/g")
export TASK_JSON=$(echo ${TASK_JSON} | sed "s/__MEM__/${SPEC_MEM}/g")
export TASK_JSON=$(echo ${TASK_JSON} | sed "s/__REPO_DOMAIN__/${REPO_DOMAIN}/g")
export TASK_JSON=$(echo ${TASK_JSON} | sed "s/__REPO_URL__/${REPO_URL}/g")
export TASK_JSON=$(echo ${TASK_JSON} | sed "s/__IMAGE_TAG__/${IMAGE_TAG}/g")
export TASK_JSON=$(echo ${TASK_JSON} | sed "s/__REGION__/${REGION}/g")
export TASK_JSON=$(echo ${TASK_JSON} | sed "s/__ENV__/${ENV}/g")
export TASK_JSON=$(echo ${TASK_JSON} | sed "s/__ROLE_TASK__/${ROLE_TASK}/g")
export TASK_JSON=$(echo ${TASK_JSON} | sed "s/__ROLE_EXEC__/${ROLE_EXEC}/g")
export TASK_JSON=$(echo ${TASK_JSON} | sed "s/__LOG_GROUP__/${LOG_GROUP}/g")
echo ${TASK_JSON} > ${TASK_PATH}/taskDefinition.json
cat ${TASK_PATH}/taskDefinition.json
