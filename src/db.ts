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

  constructor(accountsTableName: string, nodesTableName: string, chainsTableName: string, sessionTokensTableName: string, invitationsTableName: string, poktAccountsTableName: string, providersTableName: string, gatewaysTableName: string, rpcEndpointsTableName: string) {
    this.Accounts = createAccountModel(accountsTableName);
    this.Nodes = createNodeModel(nodesTableName);
    this.Chains = createChainModel(chainsTableName);
    this.SessionTokens = createSessionTokenModel(sessionTokensTableName);
    this.Invitations = createInvitationModel(invitationsTableName);
    this.PoktAccounts = createPoktAccountModel(poktAccountsTableName);
    this.Providers = createProviderModel(providersTableName);
    this.Gateways = createGatewayModel(gatewaysTableName);
    this.RpcEndpoints = createRpcEndpointModel(rpcEndpointsTableName);
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
