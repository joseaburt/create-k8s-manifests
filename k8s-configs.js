/**
 * @type {import("create-k8s-manifests").Configuration}
 */
module.exports = {
  shared: {
    appName: 'inventory-api',
    labels: {
      org: 'delinternet',
    },
    secrets: {
      name: 'secret',
      type: 'data',
    },
  },
  envs: ['prod', 'dev'],
  environment: {
    persistentVolumes: [
      {
        name: 'nfs-pv',
        type: 'nfs',
      },
      {
        name: 'local-pv',
        type: 'hostPath',
      },
    ],
    services: [
      {
        name: 'service',
        type: 'LoadBalancer',
        ingress: {
          host: 'inventory.delinterent.com',
          port: '800',
        },
        port: '80',
        targetPort: '3000',
      },
    ],
    deployments: [
      {
        name: 'deploy',
        replicas: '1',
        containers: [
          {
            image: 'nginx',
            name: 'nginx',
            port: '80',
          },
        ],
      },
    ],
  },
};
