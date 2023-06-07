import dynogels, { Model } from 'dynogels';
import { createAccountModel } from './models/account';
import { createNodeModel } from './models/nodes';
import { createChainModel } from './models/chains';
import { createSessionTokenModel } from './models/session-tokens';
import { createInvitationModel } from './models/invitation';
import { createPoktAccountModel } from './models/pokt-account';
import { createProviderModel } from './models/provider';
import { createGatewayModel } from './models/gateway';
import { createRpcEndpointModel } from './models/rpc-endpoint';
import { createUserChainHostModel } from './models/user-chain-host';
import { createDeletedAccountModel } from './models/deleted-account';
import { createDeletedNodeModel } from './models/deleted-nodes';
import { createUserDomainModel } from './models/user-domain';
import { createDeletedUserDomainModel } from './models/deleted-user-domain';
import { createRelayInvoiceModel } from './models/relay-invoice';
import { createApiKeyModel } from './models/api-key';
import { createGeneralRelayLogModel } from './models/general-relay-log';
import { createProviderPaymentModel } from './models/provider-payment';

export class DB {

  Accounts: Model;
  Nodes: Model;
  Chains: Model;
  SessionTokens: Model;
  Invitations: Model;
  PoktAccounts: Model;
  Providers: Model;
  Gateways: Model;
  RpcEndpoints: Model;
  UserChainHosts: Model;
  UserDomains: Model;
  DeletedAccounts: Model;
  DeletedNodes: Model;
  DeletedUserDomains: Model;
  RelayInvoices: Model;
  ApiKeys: Model;
  GeneralRelayLogs: Model;
  ProviderPayments: Model;

  constructor(accountsTableName: string, nodesTableName: string, chainsTableName: string, sessionTokensTableName: string, invitationsTableName: string, poktAccountsTableName: string, providersTableName: string, gatewaysTableName: string, rpcEndpointsTableName: string, userChainHostTableName: string, userDomainTableName: string, deletedAccountsTableName: string, deletedNodesTableName: string, deletedUserDomainsTableName: string, relayInvoicesTableName: string, apiKeysTableName: string, generalRelayLogsTableName: string, providerPaymentsTableName: string) {
    this.Accounts = createAccountModel(accountsTableName);
    this.Nodes = createNodeModel(nodesTableName);
    this.Chains = createChainModel(chainsTableName);
    this.SessionTokens = createSessionTokenModel(sessionTokensTableName);
    this.Invitations = createInvitationModel(invitationsTableName);
    this.PoktAccounts = createPoktAccountModel(poktAccountsTableName);
    this.Providers = createProviderModel(providersTableName);
    this.Gateways = createGatewayModel(gatewaysTableName);
    this.RpcEndpoints = createRpcEndpointModel(rpcEndpointsTableName);
    this.UserChainHosts = createUserChainHostModel(userChainHostTableName);
    this.UserDomains = createUserDomainModel(userDomainTableName);
    this.DeletedAccounts = createDeletedAccountModel(deletedAccountsTableName);
    this.DeletedNodes = createDeletedNodeModel(deletedNodesTableName);
    this.DeletedUserDomains = createDeletedUserDomainModel(deletedUserDomainsTableName);
    this.RelayInvoices = createRelayInvoiceModel(relayInvoicesTableName);
    this.ApiKeys = createApiKeyModel(apiKeysTableName);
    this.GeneralRelayLogs = createGeneralRelayLogModel(generalRelayLogsTableName);
    this.ProviderPayments = createProviderPaymentModel(providerPaymentsTableName);
  }

  initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      dynogels.createTables(err => {
        if(err)
          reject(err);
        else
          resolve();
      });
    });
  }

}
