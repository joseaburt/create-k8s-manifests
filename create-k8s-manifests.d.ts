#!/usr/bin/env node
export type SecretType = 'data' | 'dockerconfigjson';
export type PersistentVolumeType = 'hostPath' | 'nfs';
export type PersistentVolume = {
    name: string;
    type: PersistentVolumeType;
};
export type Secret = {
    name: string;
    type: SecretType;
};
export type Shared = {
    secrets: Secret;
    appName: string;
    labels: Record<string, string>;
};
export type Ingress = {
    host: string;
    port: string;
};
export type Service = {
    name: string;
    port: string;
    targetPort: string;
    ingress?: Ingress;
    type: 'ClusterIP' | 'NodePort' | 'LoadBalancer';
};
export type DeploymentContainer = {
    name: string;
    image: string;
    port: string;
};
export type Deployment = {
    name: string;
    replicas: string;
    containers: DeploymentContainer[];
};
export type Environment = {
    services: Service[];
    deployments: Deployment[];
    persistentVolumes: PersistentVolume[];
};
export type Configuration = {
    shared: Shared;
    envs: string[];
    environment: Environment;
};
