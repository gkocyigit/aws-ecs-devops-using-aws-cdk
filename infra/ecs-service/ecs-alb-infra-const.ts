import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as ddb from '@aws-cdk/aws-dynamodb';
import * as iam from '@aws-cdk/aws-iam';
import * as ecs from '@aws-cdk/aws-ecs';
import * as ecsPatterns from '@aws-cdk/aws-ecs-patterns';
import * as loadBalancer from '@aws-cdk/aws-elasticloadbalancingv2';

export interface EcsAlbInfraProps {
    stackName: string;
    vpc: ec2.IVpc;
    cluster: ecs.ICluster;
    infraVersion: string;
    containerPort: number;
}

export class EcsAlbInfraConstrunct extends cdk.Construct {
    table: ddb.Table;
    containerName: string;
    service: ecs.FargateService;
    alb: loadBalancer.ApplicationLoadBalancer;

    
    constructor(scope: cdk.Construct, id: string, props: EcsAlbInfraProps) {
        super(scope, id);

        this.table = new ddb.Table(this, 'table', {
            tableName: `${props.stackName}-DataTable`,
            partitionKey: {
                name: 'id',
                type: ddb.AttributeType.STRING
            },
            removalPolicy: cdk.RemovalPolicy.DESTROY // not recommended for Prod
        });

        const baseName = props.stackName;
        this.containerName = `${baseName}Container`
        const albFargateService = new ecsPatterns.ApplicationLoadBalancedFargateService(this, 'Service', {
            cluster: props.cluster,
            memoryLimitMiB: 1024,
            cpu: 512,
            desiredCount: 2,
            taskImageOptions: {
                image: ecs.ContainerImage.fromRegistry("amazon/amazon-ecs-sample"),
                containerName: this.containerName,
                environment: {
                    APP_NAME: props.stackName,
                    INFRA_VERSION: props.infraVersion,
                    CONTAINER_SERVICE: 'AWS ECS',
                    TABLE_NAME: this.table.tableName,
                    PORT_IN: `${props.containerPort}`
                },
                logDriver: new ecs.AwsLogDriver({
                    streamPrefix: `${baseName}Log`
                }),
                enableLogging: true,
                executionRole: this.createExecutionRole(baseName),
                containerPort: props.containerPort
            },
            circuitBreaker: {
                rollback: true
            }            
        });
        this.service = albFargateService.service;
        this.alb = albFargateService.loadBalancer;
    }

    private createExecutionRole(baseName: string): iam.Role {
        const role = new iam.Role(this, `ExecutionRole`, {
            roleName: `${baseName}Role`,
            assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com')
        });

        role.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            resources: ['*'],
            actions: [
                "ecr:GetAuthorizationToken",
                "ecr:BatchCheckLayerAvailability",
                "ecr:GetDownloadUrlForLayer",
                "ecr:BatchGetImage",
                "logs:CreateLogStream",
                "logs:PutLogEvents",
                "dynamodb:*"
            ]
        }));

        return role;
    }
}