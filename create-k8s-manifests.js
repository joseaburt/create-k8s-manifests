#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
function createTemplateBuilders(appName, env, labels) {
    const namespace = `${appName}-${env}`;
    const addSeparator = (str) => `\n\n---\n\n${str}`;
    const createLabelBlock = () => {
        if (!Object.keys(labels).length)
            return '';
        let str = '\n';
        for (const [key, value] of Object.entries(labels)) {
            str += `    ${key}: ${value}\n`;
        }
        str = str.trimEnd();
        return `labels: ${str}`;
    };
    const labelBlock = createLabelBlock();
    const createAppName = (objectName) => {
        return `${namespace}-${objectName}`;
    };
    const createNamespace = () => `
apiVersion: v1
kind: Namespace
metadata:
  name: ${namespace}
`;
    const createStringDataSecret = (name) => `
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
    const createDockerConfigJsonSecret = (name) => `
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
    const createSecrets = ({ type, name }) => {
        let content = '';
        if (type === 'dockerconfigjson')
            content = createDockerConfigJsonSecret(name);
        else
            content = createStringDataSecret(name);
        return content;
    };
    const createHostPathPersistentVolume = (name) => `
kind: PersistentVolume
apiVersion: v1
metadata:
  name: ${name}
  ${labelBlock}
spec:
  storageClassName: local
  capacity:
    storage: 1Gi
  accessModes:
  - ReadWriteMany
  hostPath:
    path: "/mnt/<YOUR_PATH>"
`;
    const createNFSPersistentVolume = (name) => `
apiVersion: v1
kind: PersistentVolume
metadata:
  name: ${name}
  ${labelBlock}
spec:
  storageClassName: remote
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
    const createPersistentVolume = (pv) => {
        let content = '';
        let storageClassName = 'local';
        const name = createAppName(pv.name);
        if (pv.type === 'nfs') {
            content += createNFSPersistentVolume(name);
            storageClassName = 'remote';
        }
        else
            content += createHostPathPersistentVolume(name);
        const pvc = `
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: ${name}c
spec:
  accessModes:
  - ReadWriteMany
  resources:
    requests:
      storage: 10Gi
  storageClassName: ${storageClassName}
`;
        content += addSeparator(pvc);
        return content;
    };
    const createService = (service) => {
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
        }
        else if (service.type === 'NodePort') {
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
        }
        else {
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
    const createIngress = (ingress) => {
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
        const addHost = ({ service, ingress }) => `
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
        for (const it of ingress)
            content += addHost(it);
        return content;
    };
    const createDeployment = (deploy) => {
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
        const createContainer = ({ name, image, port }) => `
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
    static write(name, content) {
        fs_1.default.writeFileSync(path_1.default.join(this.envPath, `${name}.yml`), content.trim());
    }
    static createManifests() {
        const { shared, environment, envs } = require(path_1.default.join(process.cwd(), 'k8s-configs'));
        let currentPath = path_1.default.join(process.cwd(), 'k8s');
        if (fs_1.default.existsSync(currentPath))
            currentPath = path_1.default.join(process.cwd(), `k8s-${Date.now()}`);
        fs_1.default.mkdirSync(currentPath);
        const { deployments, persistentVolumes, services } = environment;
        for (const env of envs) {
            this.envPath = path_1.default.join(currentPath, env);
            fs_1.default.mkdirSync(this.envPath);
            const { addSeparator, createConfigMap, createDeployment, createIngress, createNamespace, createPersistentVolume, createSecrets, createService } = createTemplateBuilders(shared.appName, env, shared.labels);
            let commonsManifest = createNamespace();
            commonsManifest += addSeparator(createSecrets(shared.secrets));
            commonsManifest += addSeparator(createConfigMap());
            for (const pv of persistentVolumes)
                commonsManifest += addSeparator(createPersistentVolume(pv));
            this.write('commons', commonsManifest);
            // ==============================================================
            let servicesTemp = '';
            const ingress = [];
            for (const service of services) {
                if (service.ingress)
                    ingress.push({ service: service.name, ingress: service.ingress });
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
TemplateBuilder.envPath = '';
TemplateBuilder.createManifests();
