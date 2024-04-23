#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

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

function createTemplateBuilders(appName: string, env: string, labels: Shared['labels']) {
  const namespace = `${appName}-${env}`;
  const addSeparator = (str: string) => `\n\n---\n\n${str}`;

  const createLabelBlock = () => {
    let str = '\n';
    for (const [key, value] of Object.entries(labels)) {
      str += `    ${key}: ${value}\n`;
    }
    str = str.trimEnd();
    return `  labels: ${str}`;
  };

  const labelBlock = createLabelBlock();

  const createAppName = (objectName: string) => {
    return `${namespace}-${objectName}`;
  };

  const createNamespace = () => `
apiVersion: v1
kind: Namespace
metadata:
  name: ${namespace}
`;

  const createStringDataSecret = (name: string) => `
apiVersion: v1
kind: Secret
metadata:
  name: ${createAppName(name)}
  namespace: ${namespace}
   ${labelBlock}
type: Opaque
stringData:
  MY_SECRET_KEY: <Value>
`;

  const createDockerConfigJsonSecret = (name: string) => `
apiVersion: v1
kind: Secret
metadata:
  name: ${createAppName(name)}
  namespace: ${namespace}
   ${labelBlock}
type: kubernetes.io/dockerconfigjson
data:
  .dockerconfigjson: <BASE_64_JSON>

`;

  const createConfigMap = () => `
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${createAppName('conf-map')}
  namespace: ${namespace}
   ${labelBlock}
data:
  KEY_NAME: <Value>

`;

  const createSecrets = ({ type, name }: Shared['secrets']) => {
    let content = '';
    if (type === 'dockerconfigjson') content = createDockerConfigJsonSecret(name);
    else content = createStringDataSecret(name);
    return content;
  };

  const createHostPathPersistentVolume = (name: string) => `
kind: PersistentVolume
apiVersion: v1
metadata:
  name: ${name}
   ${labelBlock}
spec:
  storageClassName: manual
  capacity:
    storage: 1Gi
  accessModes:
    - ReadWriteMany
  hostPath:
    path: "/mnt/<YOUR_PATH>"
`;

  const createNFSPersistentVolume = (name: string) => `
apiVersion: v1
kind: PersistentVolume
metadata:
  name: ${name}
   ${labelBlock}
spec:
  capacity:
    storage: 1Gi
  volumeMode: Filesystem
  accessModes:
    - ReadWriteMany
  persistentVolumeReclaimPolicy: Retain
  nfs:
    path: /<YOUR_PATH>
    server: nfs-server-ip-address
`;

  const createPersistentVolume = (pv: PersistentVolume) => {
    const name = createAppName(pv.name);
    if (pv.type === 'nfs') return createNFSPersistentVolume(name);
    else return createHostPathPersistentVolume(name);
  };

  const createService = (service: Service) => {
    if (service.type === 'ClusterIP') {
      return `
apiVersion: v1
kind: Service
metadata:
  name: ${createAppName(service.name)}
  namespace: ${namespace}
   ${labelBlock}
spec:
  type: ClusterIP
  selector:
    app: ${appName}
  ports:
  - protocol: TCP
    port: ${service.port}
    targetPort: ${service.targetPort}
`;
    } else if (service.type === 'NodePort') {
      return `
apiVersion: v1
kind: Service
metadata:
  name: ${createAppName(service.name)}
  namespace: ${namespace}
   ${labelBlock}
spec:
  type: NodePort
  selector:
    app: ${appName}
  ports:
  - protocol: TCP
    port: ${service.port}
    nodePort: ${service.targetPort}
`;
    } else {
      return `
apiVersion: v1
kind: Service
metadata:
  name: ${createAppName(service.name)}
  namespace: ${namespace}
   ${labelBlock}
spec:
  type: LoadBalancer
  selector:
    app: ${appName}
  ports:
  - protocol: TCP
    port: ${service.port}
    targetPort: ${service.targetPort}
`;
    }
  };

  const createIngress = (ingress: { service: string; ingress: Ingress }[]) => {
    let content = `
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ${createAppName('ingress')}
  namespace: ${namespace}
   ${labelBlock}
  annotations:
  nginx.ingress.kubernetes.io/rewrite-target: /  
spec:
  ingressClassName: ingress-nginx
  rules:`;

    const addHost = ({ service, ingress }: { service: string; ingress: Ingress }) => `
  - host: ${ingress.host}
    http:
      paths:
      - pathType: Prefix
        path: "/"
        backend:
          service:
            name: ${service}
            port: 
              number: ${ingress.port}\n
    `;

    for (const it of ingress) content += addHost(it);
    return content;
  };

  const createDeployment = (deploy: Deployment) => {
    let content = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${createAppName(deploy.name)}
  namespace: ${namespace}
   ${labelBlock}
spec:
  replicas: 1
  selector:
    matchLabels:
      app: ${appName}
  template:
    metadata:
      labels:
        app: ${appName}
    spec:
      containers:`;

    const createContainer = ({ name, image, port }: DeploymentContainer) => `
      - name: ${name}
        image: ${image}
        ports:
        - containerPort: ${port}\n
`;

    for (const container of deploy.containers) {
      content += createContainer(container);
    }

    return content;
  };

  return {
    addSeparator,
    createAppName,
    createNamespace,
    createStringDataSecret,
    createDockerConfigJsonSecret,
    createConfigMap,
    createSecrets,
    createPersistentVolume,
    createService,
    createIngress,
    createDeployment,
  };
}

class TemplateBuilder {
  private static envPath: string = '';

  private static write(name: string, content: string) {
    fs.writeFileSync(path.join(this.envPath, `${name}.yml`), content.trim());
  }

  public static createManifests() {
    const { shared, environment, envs } = require(path.join(process.cwd(), 'k8s-configs')) as Configuration;

    let currentPath = path.join(process.cwd(), 'k8s');

    if (fs.existsSync(currentPath)) currentPath = path.join(process.cwd(), `k8s-${Date.now()}`);

    fs.mkdirSync(currentPath);

    const { deployments, persistentVolumes, services } = environment;

    for (const env of envs) {
      this.envPath = path.join(currentPath, env);
      fs.mkdirSync(this.envPath);

      const { addSeparator, createConfigMap, createDeployment, createIngress, createNamespace, createPersistentVolume, createSecrets, createService } = createTemplateBuilders(shared.appName, env, shared.labels);

      let commonsManifest = createNamespace();
      commonsManifest += addSeparator(createSecrets(shared.secrets));
      commonsManifest += addSeparator(createConfigMap());
      for (const pv of persistentVolumes) commonsManifest += addSeparator(createPersistentVolume(pv));
      this.write('commons', commonsManifest);

      // ==============================================================
      let servicesTemp = '';
      const ingress: { service: string; ingress: Ingress }[] = [];
      for (const service of services) {
        if (service.ingress) ingress.push({ service: service.name, ingress: service.ingress });
        servicesTemp += addSeparator(createService(service));
      }
      this.write('services', servicesTemp.replace('---', ''));
      this.write('ingress', createIngress(ingress));

      // ==============================================================
      let deploymentTemp = '';
      for (const deployment of deployments) {
        deploymentTemp += addSeparator(createDeployment(deployment));
      }
      this.write('deployments', deploymentTemp.replace('---', ''));
    }
  }
}

TemplateBuilder.createManifests();
