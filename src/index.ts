import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DB } from './db';
import {
  AccountAddChainPostBody,
  AccountDeletePostBody,
  AccountsHandler, AccountUpdateChainsPostBody,
  PrivateKeyPostBody,
  UpdateEmailPostBody,
  UpdatePasswordPostBody
} from './route-handlers/accounts-handler';
import formData from 'form-data';
import Mailgun from 'mailgun.js';
import { routes } from './constants';
import { NodesHandler, NodesPostBody } from './route-handlers/nodes-handler';
import { ChainsHandler } from './route-handlers/chains-handler';
import {
  InviteHandlerPostBody,
  QueryPoktNodesPostBody,
  RegisterHandlerPostBody,
  RootHandler,
  UnlockHandlerPostBody
} from './route-handlers/root-handler';
import { CCServer } from './cc-server';
import { httpResponse } from './util';
import { EncryptionManager } from './encryption-manager';
import { PoktUtils } from './pokt-utils';
import {
  ProviderGatewayErrorLogPostBody,
  ProvidersHandler,
  ProviderUnlockPostBody
} from './route-handlers/providers-handler';

const {
  CC_ACCOUNTS_TABLE_NAME = 'ccAccounts-prod',
  CC_NODES_TABLE_NAME = 'ccNodes-prod',
  CC_CHAINS_TABLE_NAME = 'ccChains-prod',
  CC_SESSION_TOKENS_TABLE_NAME = 'ccSessionTokens-prod',
  CC_INVITATIONS_TABLE_NAME = 'ccInvitations-prod',
  CC_POKT_ACCOUNTS_TABLE_NAME = 'ccPoktAccounts-prod',
  CC_PROVIDERS_TABLE_NAME = 'ccProviders-prod',
  CC_GATEWAYS_TABLE_NAME = 'ccGateways-prod',
  CC_RPC_ENDPOINTS_TABLE_NAME = 'ccRpcEndpoints-prod',
  CC_USER_CHAIN_HOSTS_TABLE_NAME = 'ccUserChainHosts-prod',
  CC_CHAINS_DOMAIN = '',
  MAILGUN_KEY = '',
  MAILGUN_DOMAIN = '',
  RECAPTCHA_SECRET = '',
  POKT_ACCOUNT_PASS = '',
  POKT_ENDPOINT = '',
} = process.env;

const toCheck: {[key: string]: string} = {
  CC_ACCOUNTS_TABLE_NAME,
  CC_NODES_TABLE_NAME,
  CC_CHAINS_TABLE_NAME,
  CC_SESSION_TOKENS_TABLE_NAME,
  CC_INVITATIONS_TABLE_NAME,
  CC_POKT_ACCOUNTS_TABLE_NAME,
  CC_PROVIDERS_TABLE_NAME,
  CC_GATEWAYS_TABLE_NAME,
  CC_RPC_ENDPOINTS_TABLE_NAME,
  CC_CHAINS_DOMAIN,
  CC_USER_CHAIN_HOSTS_TABLE_NAME,
  MAILGUN_KEY,
  MAILGUN_DOMAIN,
  RECAPTCHA_SECRET,
  POKT_ACCOUNT_PASS,
  POKT_ENDPOINT,
};
for(const key of Object.keys(toCheck)) {
  if(!toCheck[key])
    throw new Error(`You must enter a ${key} environment variable.`);
}

const mailgun = new Mailgun(formData);
const mg = mailgun.client({username: 'api', key: MAILGUN_KEY});

const db = new DB(
  CC_ACCOUNTS_TABLE_NAME,
  CC_NODES_TABLE_NAME,
  CC_CHAINS_TABLE_NAME,
  CC_SESSION_TOKENS_TABLE_NAME,
  CC_INVITATIONS_TABLE_NAME,
  CC_POKT_ACCOUNTS_TABLE_NAME,
  CC_PROVIDERS_TABLE_NAME,
  CC_GATEWAYS_TABLE_NAME,
  CC_RPC_ENDPOINTS_TABLE_NAME,
  CC_USER_CHAIN_HOSTS_TABLE_NAME,
);
// db.initialize()
//   .then(() => {
//     console.log('Database tables initialized');
//   })
//   .catch(err => {
//     console.error(err);
//   });

const encryptionManger = new EncryptionManager(POKT_ACCOUNT_PASS);
const poktUtils = new PoktUtils(POKT_ENDPOINT);

const rootHandler = new RootHandler(db, mg, MAILGUN_DOMAIN, RECAPTCHA_SECRET, encryptionManger, poktUtils);
const accountsHandler = new AccountsHandler(db, RECAPTCHA_SECRET, poktUtils, encryptionManger);
const nodesHandler = new NodesHandler(db, poktUtils);
const chainsHandler = new ChainsHandler(db);
const providerHandler = new ProvidersHandler(db);

const server = new CCServer();

const postInviteBody: InviteHandlerPostBody = {
  email: '',
  recaptchaToken: '',
};
const postRegisterBody: RegisterHandlerPostBody = {
  email: '',
  password: '',
  domain: '',
  invitation: '',
  agreeTos: true,
  agreePrivacyPolicy: true,
  agreeCookies: true,
};
const postUnlockBody: UnlockHandlerPostBody = {
  email: '',
  password: '',
};
const queryPoktNodesPostBody: QueryPoktNodesPostBody = {
  addresses: [''],
};
const postAccountUpdateEmailBody: UpdateEmailPostBody = {
  email: '',
  recaptchaToken: '',
};
const postAccountUpdatePasswordBody: UpdatePasswordPostBody = {
  currentPassword: '',
  newPassword: '',
};
const postAccountPrivateKeyBody: PrivateKeyPostBody = {
  password: '',
};
const postAccountDeleteBody: AccountDeletePostBody = {
  password: '',
};
const postNodesBody: NodesPostBody = {
  address: '',
};
const postAccountAddChainBody: AccountAddChainPostBody = {
  id: '',
};
const postAccountRemoveChainBody: AccountAddChainPostBody = {
  id: '',
};
const postAccountUpdateChainsBody: AccountUpdateChainsPostBody = {
  chains: [''],
};
const postProviderUnlockBody: ProviderUnlockPostBody = {
  key: '',
};
const postLogsBody: ProviderGatewayErrorLogPostBody = {
  logs: [''],
};

server
  // rootHandler routes
  .get(routes.VERSION, rootHandler.getVersion, false, null)
  .post(routes.INVITE, rootHandler.postInvite, false, postInviteBody)
  .post(routes.REGISTER, rootHandler.postRegister, false, postRegisterBody)
  .post(routes.UNLOCK, rootHandler.postUnlock, false, postUnlockBody)
  .post(routes.QUERY_POKT_NODES, rootHandler.postQueryPoktNodes, true, queryPoktNodesPostBody)
  // accountsHandler routes
  .get(routes.ACCOUNT, accountsHandler.getAccount, true, null)
  .post(routes.ACCOUNT_UPDATE_EMAIL, accountsHandler.postAccountUpdateEmail, true, postAccountUpdateEmailBody)
  .post(routes.ACCOUNT_UPDATE_PASSWORD, accountsHandler.postAccountUpdatePassword, true, postAccountUpdatePasswordBody)
  .post(routes.ACCOUNT_PRIVATE_KEY, accountsHandler.postAccountPrivateKey, true, postAccountPrivateKeyBody)
  .get(routes.ACCOUNT_BALANCE, accountsHandler.getAccountBalance, true, null)
  .post(routes.ACCOUNT_ADD_CHAIN, accountsHandler.postAccountAddChain, true, postAccountAddChainBody)
  .post(routes.ACCOUNT_REMOVE_CHAIN, accountsHandler.postAccountRemoveChain, true, postAccountRemoveChainBody)
  .post(routes.ACCOUNT_UPDATE_CHAINS, accountsHandler.postAccountUpdateChains, true, postAccountUpdateChainsBody)
  .post(routes.ACCOUNT_DELETE, accountsHandler.postAccountDelete, true, postAccountDeleteBody)
  // chainsHandler routes
  .get(routes.CHAINS, chainsHandler.getChains, true, null)
  .get(routes.CHAIN, chainsHandler.getChain, true, null)
  // nodesHandler routes
  .get(routes.NODES, nodesHandler.getNodes, true, null)
  .post(routes.NODES, nodesHandler.postNodes, true, postNodesBody)
  .get(routes.NODE, nodesHandler.getNode, true, null)
  .post(routes.NODE_DELETE, nodesHandler.postNodeDelete, true, null)

  .post(routes.PROVIDER_UNLOCK, providerHandler.postProviderUnlock, false, postProviderUnlockBody)
  .get(routes.PROVIDER, providerHandler.getProvider, true, null)
  .get(routes.PROVIDER_GATEWAYS, providerHandler.getProviderGateways, true, null)
  .get(routes.PROVIDER_GATEWAY, providerHandler.getProviderGateway, true, null)
  .get(routes.PROVIDER_GATEWAY_RPC_ENDPOINTS, providerHandler.getProviderGatewayRpcEndpoints, true, null)
  .get(routes.PROVIDER_GATEWAY_HOSTS, providerHandler.getProviderGatewayHosts, true, null)
  .post(routes.PROVIDER_GATEWAY_ERROR_LOG, providerHandler.postProviderGatewayErrorLog, true, postLogsBody)
  .post(routes.PROVIDER_GATEWAY_INFO_LOG, providerHandler.postProviderGatewayInfoLog, true, postLogsBody)
  .post(routes.PROVIDER_GATEWAY_SERVER_NOTICE_LOG, providerHandler.postProviderGatewayServerNoticeLog, true, postLogsBody)

  .get(routes.DOCS, async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    return httpResponse(200, server.docs([
      routes.INVITE,
      routes.REGISTER,
      routes.QUERY_POKT_NODES,
      routes.ACCOUNT_UPDATE_EMAIL,
      routes.PROVIDER_UNLOCK,
      routes.PROVIDER,
      routes.PROVIDER_GATEWAYS,
      routes.PROVIDER_GATEWAY,
      routes.PROVIDER_GATEWAY_RPC_ENDPOINTS,
      routes.PROVIDER_GATEWAY_HOSTS,
      routes.PROVIDER_GATEWAY_ERROR_LOG,
      routes.PROVIDER_GATEWAY_INFO_LOG,
      routes.PROVIDER_GATEWAY_SERVER_NOTICE_LOG,
    ]));
  }, false, null);

exports.handler = async function(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  return server.handle(event);
};
