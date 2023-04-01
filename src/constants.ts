export const DEFAULT_TIMEOUT = 30000;

export const routes = {
  VERSION: '/v1/version',
  INVITE: '/v1/invite',
  REGISTER: '/v1/register',
  UNLOCK: '/v1/unlock',
  QUERY_POKT_NODES: '/v1/query-pokt-nodes',

  ACCOUNT: '/v1/accounts/{id}',
  ACCOUNT_UPDATE_EMAIL: '/v1/accounts/{id}/update-email',
  ACCOUNT_UPDATE_PASSWORD: '/v1/accounts/{id}/update-password',
  ACCOUNT_DELETE: '/v1/accounts/{id}/delete',
  ACCOUNT_BALANCE: '/v1/accounts/{id}/balance',
  ACCOUNT_PRIVATE_KEY: '/v1/accounts/{id}/private-key',
  ACCOUNT_ADD_CHAIN: '/v1/accounts/{id}/add-chain',
  ACCOUNT_REMOVE_CHAIN: '/v1/accounts/{id}/remove-chain',
  ACCOUNT_UPDATE_CHAINS: '/v1/accounts/{id}/update-chains',

  NODES: '/v1/nodes',
  NODE: '/v1/nodes/{address}',
  NODE_DELETE: '/v1/nodes/{address}/delete',

  CHAINS: '/v1/chains',
  CHAIN: '/v1/chains/{id}',

  PROVIDER_UNLOCK: '/v1/providers/{providerid}/unlock',
  PROVIDER: '/v1/providers/{providerid}',
  PROVIDER_GATEWAYS: '/v1/providers/{providerid}/gateways',
  PROVIDER_GATEWAY: '/v1/providers/{providerid}/gateways/{gatewayid}',
  PROVIDER_GATEWAY_HOSTS: '/v1/providers/{providerid}/gateways/{gatewayid}/hosts',
  PROVIDER_GATEWAY_RPC_ENDPOINTS: '/v1/providers/{providerid}/gateways/{gatewayid}/rpc-endpoints',
  PROVIDER_GATEWAY_ERROR_LOG: '/v1/providers/{providerid}/gateways/{gatewayid}/error-log',
  PROVIDER_GATEWAY_INFO_LOG: '/v1/providers/{providerid}/gateways/{gatewayid}/info-log',
  PROVIDER_GATEWAY_SERVER_NOTICE_LOG: '/v1/providers/{providerid}/gateways/{gatewayid}/server-notice-log',

  DOCS: '/v1/docs',
};

export const SESSION_TOKEN_HEADER = 'x-api-key';
