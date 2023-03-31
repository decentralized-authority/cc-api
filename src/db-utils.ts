import { DB } from './db';
import { Chain, Node, ChainUrl, PoktAccount, RpcEndpoint } from './interfaces';
import { Gateway, Provider } from './route-handlers/providers-handler';
import { SessionToken } from './route-handlers/root-handler';
import { Account } from './route-handlers/accounts-handler';

export class DBUtils {

  db: DB

  constructor(db: DB) {
    this.db = db;
  }

  getAccount(id: string): Promise<Account|null> {
    return new Promise<Account|null>((resolve, reject) => {
      this.db.Accounts.get({id}, (err, res) => {
        if(err) {
          reject(err);
        } else if(res) {
          const { attrs } = res as any;
          resolve({
            ...attrs,
            chains: JSON.parse(attrs.chains),
          });
        } else {
          resolve(null);
        }
      });
    });
  }

  getAccountsByEmail(email: string): Promise<Account[]> {
    return new Promise((resolve, reject) => {
      this.db.Accounts
        .scan()
        .loadAll()
        .where('email').equals(email)
        .exec((err, { Items }) => {
          if(err)
            reject(err);
          else
            resolve(Items.map((item: {attrs: any}) => {
              const { attrs } = item;
              return {
                ...attrs,
                chains: JSON.parse(attrs.chains),
              };
            }));
        });
    });
  }

  createAccount(account: Account): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      this.db.Accounts.create({
        ...account,
        chains: JSON.stringify(account.chains),
      }, err => {
        if(err)
          reject(err);
        else
          resolve(true);
      });
    });
  }

  updateAccount(id: string, changes: {chains?: ChainUrl[]}): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      const updates: any = {...changes};
      if(updates.chains)
        updates.chains = JSON.stringify(updates.chains);
      this.db.Accounts.update({
        ...updates,
        id,
      }, err => {
        if(err)
          reject(err);
        else
          resolve(true);
      });
    });
  }

  deleteAccount(id: string): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      this.db.Accounts.destroy({id}, err => {
        if(err)
          reject(err);
        else
          resolve(true);
      });
    });
  }

  createSessionToken(sessionToken: SessionToken): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      this.db.SessionTokens.create(sessionToken, err => {
        if(err)
          reject(err);
        else
          resolve(true);
      });
    });
  }

  deleteSessionToken(token: string): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      this.db.SessionTokens.destroy({token}, err => {
        if(err)
          reject(err);
        else
          resolve(true);
      });
    });
  }

  getChains(): Promise<Chain[]> {
    return new Promise<Chain[]>((resolve, reject) => {
      this.db.Chains
        .scan()
        .loadAll()
        .exec((err, { Items }) => {
          if(err) {
            reject(err);
          } else {
            resolve(Items.map((i: { attrs: any; }) => i.attrs));
          }
        });
    });
  }

  getChain(id: string): Promise<Chain|null> {
    return new Promise<Chain|null>((resolve, reject) => {
      this.db.Chains.get({id}, (err, res) => {
        if(err) {
          reject(err);
        } else if(res) {
          // @ts-ignore
          resolve(res.attrs);
        } else {
          resolve(null);
        }
      });
    });
  }

  createChain(chain: Chain): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      this.db.Chains.create(chain, err => {
        if(err)
          reject(err);
        else
          resolve(true);
      });
    });
  }

  deleteChain(id: string): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      this.db.Chains.destroy({id}, err => {
        if(err)
          reject(err);
        else
          resolve(true);
      });
    });
  }

  getNodes(): Promise<Node[]> {
    return new Promise<Node[]>((resolve, reject) => {
      this.db.Nodes
        .scan()
        .loadAll()
        .exec((err, { Items }) => {
          if(err) {
            reject(err);
          } else {
            resolve(Items.map((i: { attrs: any; }) => {
              return i.attrs;
            }));
          }
        });
    });
  }

  getNodesByUser(user: string): Promise<Node[]> {
    return new Promise<Node[]>((resolve, reject) => {
      this.db.Nodes
        .query(user)
        .usingIndex('user-address-index')
        .exec((err, res) => {
          if(err) {
            reject(err);
          } else {
            const { Items } = res;
            resolve(Items.map((i: { attrs: any; }) => {
              return i.attrs;
            }));
          }
        });
    });
  }

  getNodeByAddress(address: string, user: string): Promise<Node|null> {
    return new Promise((resolve, reject) => {
      this.db.Nodes
        .query(user)
        .usingIndex('user-address-index')
        .where('address').equals(address)
        .exec((err, res) => {
          if(err) {
            reject(err);
          } else {
            const [ item ] = res.Items;
            if(item) {
              resolve(item.attrs);
            } else {
              resolve(null);
            }
          }
        });
    });
  }

  getNodee(id: string): Promise<Node|null> {
    return new Promise<Node|null>((resolve, reject) => {
      this.db.Nodes.get({id}, (err, res) => {
        if(err) {
          reject(err);
        } else if(res) {
          // @ts-ignore
          const item = res.attrs;
          resolve(item);
        } else {
          resolve(null);
        }
      });
    });
  }

  createNode(node: Node): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      this.db.Nodes.create(node, err => {
        if(err)
          reject(err);
        else
          resolve(true);
      });
    });
  }

  updateNode(id: string, changes: {user?: string}): Promise<boolean> {
    const updateObj: any = {
      ...changes,
      id,
    };
    if(updateObj.chains)
      updateObj.chains = JSON.stringify(updateObj.chains);
    return new Promise<boolean>((resolve, reject) => {
      this.db.Nodes.update(updateObj, err => {
        if(err)
          reject(err);
        else
          resolve(true);
      });
    });
  }

  deleteNode(id: string): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      this.db.Nodes.destroy({id}, err => {
        if(err)
          reject(err);
        else
          resolve(true);
      });
    });
  }

  getPoktAccount(address: string): Promise<PoktAccount|null> {
    return new Promise<PoktAccount|null>((resolve, reject) => {
      this.db.PoktAccounts.get({address}, (err, res) => {
        if(err) {
          reject(err);
        } else if(res) {
          // @ts-ignore
          resolve(res.attrs);
        } else {
          resolve(null);
        }
      });
    });
  }

  createPoktAccount(account: {address: string, publicKey: string, privateKeyEncrypted: string}) {
    return new Promise<boolean>((resolve, reject) => {
      this.db.PoktAccounts.create({
        address: account.address,
        publicKey: account.publicKey,
        privateKeyEncrypted: account.privateKeyEncrypted,
      }, err => {
        if(err)
          reject(err);
        else
          resolve(true);
      });
    });
  }

  deletePoktAccount(address: string): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      this.db.PoktAccounts.destroy({address}, err => {
        if(err)
          reject(err);
        else
          resolve(true);
      });
    });
  }

  getProvider(id: string): Promise<Provider|null> {
    return new Promise((resolve, reject) => {
      this.db.Providers.get({id}, (err, res) => {
        if(err) {
          reject(err);
        } else if(res) {
          // @ts-ignore
          resolve(res.attrs);
        } else {
          resolve(null);
        }
      });
    });
  }

  createProvider(provider: Provider): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      this.db.Providers.create(provider, err => {
        if(err)
          reject(err);
        else
          resolve(true);
      });
    });
  }

  deleteProvider(id: string): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      this.db.Providers.destroy({id}, err => {
        if(err)
          reject(err);
        else
          resolve(true);
      });
    });
  }

  getGateway(id: string): Promise<Gateway|null> {
    return new Promise((resolve, reject) => {
      this.db.Gateways.get({id}, (err, res) => {
        if(err) {
          reject(err);
        } else if(res) {
          // @ts-ignore
          resolve(res.attrs);
        } else {
          resolve(null);
        }
      });
    });
  }

  getGatewaysByProvider(providerId: string): Promise<Gateway[]> {
    return new Promise((resolve, reject) => {
      this.db.Gateways.query(providerId)
        .usingIndex('provider-id-index')
        .exec((err, res) => {
          if(err) {
            reject(err);
          } else {
            const { Items } = res;
            resolve(Items.map((i: { attrs: any; }) => {
              return i.attrs;
            }));
          }
        });
    });
  }

  createGateway(gateway: Gateway): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      this.db.Gateways.create(gateway, err => {
        if(err)
          reject(err);
        else
          resolve(true);
      });
    });
  }

  deleteGateway(id: string): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      this.db.Gateways.destroy({id}, err => {
        if(err)
          reject(err);
        else
          resolve(true);
      });
    });
  }

  getRpcEndpointsByGateway(gatewayId: string): Promise<RpcEndpoint[]> {
    return new Promise((resolve, reject) => {
      this.db.RpcEndpoints.query(gatewayId)
        .usingIndex('gateway-id-index')
        .exec((err, res) => {
          if(err) {
            reject(err);
          } else {
            const { Items } = res;
            resolve(Items.map((i: { attrs: any; }) => {
              return i.attrs;
            }));
          }
        });
    });
  }

  createRpcEndpoint(endpoint: RpcEndpoint): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      this.db.RpcEndpoints.create(endpoint, err => {
        if(err)
          reject(err);
        else
          resolve(true);
      });
    });
  }

  deleteRpcEndpoint(id: string): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      this.db.RpcEndpoints.destroy({id}, err => {
        if(err)
          reject(err);
        else
          resolve(true);
      });
    });
  }

}
