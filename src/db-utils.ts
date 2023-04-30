import { DB } from './db';
import {
  Chain,
  Node,
  ChainHost,
  PoktAccount,
  RpcEndpoint,
  UserChainHost,
  UserDomain,
  DeletedUserDomain, DeletedNode, RelayInvoice
} from './interfaces';
import { Gateway, Provider } from './route-handlers/providers-handler';
import { SessionToken } from './route-handlers/root-handler';
import { Account } from './route-handlers/accounts-handler';
import omit from 'lodash/omit';
import uniq from 'lodash/uniq';
import { sha256 } from './util';

export class DBUtils {

  db: DB

  constructor(db: DB) {
    this.db = db;
  }

  async getAccounts(): Promise<Account[]> {
    const [ accounts, userDomains ]: [Account[], UserDomain[]] = await Promise.all([
      new Promise<Account[]>((resolve, reject) => {
        this.db.Accounts
          .scan()
          .loadAll()
          .exec((err, {Items}) => {
            if (err) {
              reject(err);
            } else {
              resolve(Items.map((i: { attrs: any; }) => {
                return {
                  ...i.attrs,
                  chains: JSON.parse(i.attrs.chains || '[]'),
                };
              }));
            }
          });
      }),
      new Promise<UserDomain[]>((resolve, reject) => {
        this.db.UserDomains
          .scan()
          .loadAll()
          .exec((err, {Items}) => {
            if (err) {
              reject(err);
            } else {
              resolve(Items.map((i: { attrs: any; }) => {
                return i.attrs;
              }));
            }
          });
      }),
    ]);
    const userToDomains = userDomains.reduce((acc, userDomain) => {
      const { user, domain } = userDomain;
      if (!acc[user]) {
        acc[user] = [];
      }
      acc[user].push(domain);
      return acc;
    }, {} as {[user: string]: string[]});
    return accounts
      .map((account) => {
        return {
          ...account,
          domains: userToDomains[account.id] || [],
        };
      });
  }

  async getAccount(id: string): Promise<Account|null> {
    const [ account, domains ]: [Account|null, string[]] = await Promise.all([
      new Promise<Account|null>((resolve, reject) => {
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
      }),
      new Promise<string[]>((resolve, reject) => {
        this.db.UserDomains
          .query(id)
          .loadAll()
          .exec((err, {Items}) => {
            if (err) {
              reject(err);
            } else {
              resolve(Items.map((i: { attrs: any; }) => {
                return i.attrs.domain;
              }));
            }
          });
      }),
    ]);
    return !account ? null : {
      ...account,
      domains,
    };
  }

  async getAccountsByEmail(email: string): Promise<Account[]> {
    const accounts: Account[] = await new Promise((resolve, reject) => {
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
    await Promise.all(accounts
      .map((account, i) => {
        return new Promise<void>((resolve, reject) => {
          this.db.UserDomains
            .query(account.id)
            .loadAll()
            .exec((err, {Items}) => {
              if (err) {
                reject(err);
              } else {
                accounts[i].domains = Items
                  .map((i: { attrs: any; }) => {
                    return i.attrs.domain;
                  });
                resolve();
              }
            });
        });
      }));
    return accounts;
  }

  async createAccount(account: Account): Promise<boolean> {
    const { domains } = account;
    const [ success ] = await Promise.all([
      new Promise<boolean>((resolve, reject) => {
        this.db.Accounts.create({
          ...omit(account, ['domains']),
          chains: JSON.stringify(account.chains),
        }, err => {
          if(err)
            reject(err);
          else
            resolve(true);
        });
      }),
      ...uniq(domains).map((domain) => {
        return new Promise<boolean>((resolve, reject) => {
          this.db.UserDomains.create({
            user: account.id,
            domain,
          }, err => {
            if(err)
              reject(err);
            else
              resolve(true);
          });
        });
      }),
    ]);
    return success;
  }

  updateAccount(id: string, changes: {chains?: ChainHost[]}): Promise<boolean> {
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

  async deleteAccount(id: string): Promise<boolean> {
    const [ account, domains ]: [Account|null, UserDomain[]] = await Promise.all([
      new Promise<Account|null>((resolve, reject) => {
        this.db.Accounts.get({id}, (err, res) => {
          if(err) {
            reject(err);
          } else if(res) {
            const { attrs } = res as any;
            resolve(attrs);
          } else {
            resolve(null);
          }
        });
      }),
      new Promise<UserDomain[]>((resolve, reject) => {
        this.db.UserDomains
          .query(id)
          .loadAll()
          .exec((err, {Items}) => {
            if (err) {
              reject(err);
            } else {
              resolve(Items.map((i: { attrs: any; }) => {
                return i.attrs;
              }));
            }
          });
      }),
    ]);
    if(!account)
      return true;
    const deletedAt = new Date().toISOString();
    const [ success ] = await Promise.all([
      new Promise<boolean>((resolve, reject) => {
        this.db.Accounts.destroy({id}, err => {
          if(err)
            reject(err);
          else
            resolve(true);
        });
      }),
      new Promise<boolean>((resolve, reject) => {
        this.db.DeletedAccounts.create({
          ...account,
          email: sha256(account.email, 'utf8'),
          deletedAt,
        }, err => {
          if(err)
            reject(err);
          else
            resolve(true);
        });
      }),
      // ...domains.map((domain) => {
      //   return new Promise<boolean>((resolve, reject) => {
      //     this.db.UserDomains.destroy(domain, err => {
      //       if(err)
      //         reject(err);
      //       else
      //         resolve(true);
      //     });
      //   });
      // }),
      ...domains.map((domain) => {
        return new Promise<boolean>((resolve, reject) => {
          this.db.DeletedUserDomains.create({
            ...domain,
            domain: sha256(domain.domain, 'utf8'),
            deletedAt,
          }, err => {
            if(err)
              reject(err);
            else
              resolve(true);
          });
        });
      }),
    ]);
    return success;
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

  getNode(id: string): Promise<Node|null> {
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

  async deleteNode(id: string): Promise<boolean> {
    const node = await this.getNode(id);
    if(!node)
      return true;
    const [ success ] = await Promise.all([
      new Promise<boolean>((resolve, reject) => {
        this.db.Nodes.destroy({id}, err => {
          if(err)
            reject(err);
          else
            resolve(true);
        });
      }),
      new Promise<void>((resolve, reject) => {
        this.db.DeletedNodes.create({
          ...node,
          address: sha256(node.address, 'utf8'),
          deletedAt: new Date().toISOString(),
        }, (err) => {
          if(err)
            reject(err);
          else
            resolve();
        });
      }),
    ]);
    return success;
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

  getUserChainHost(host: string): Promise<UserChainHost|null> {
    return new Promise((resolve, reject) => {
      this.db.UserChainHosts.get({host}, (err, res) => {
        if(err) {
          reject(err);
        } else if(res) {
          // @ts-ignore
          const attrs = res.attrs as UserChainHost;
          resolve(attrs);
        } else {
          resolve(null);
        }
      });
    });
  }

  createUserChainHost(chainHost: UserChainHost): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.db.UserChainHosts.create(chainHost, err => {
        if(err)
          reject(err);
        else
          resolve(true);
      });
    });
  }

  getDeletedUserDomainsByHashedDomain(hashedDomain: string): Promise<DeletedUserDomain[]> {
    return new Promise((resolve, reject) => {
      this.db.DeletedUserDomains
        .scan()
        .loadAll()
        .where('domain').equals(hashedDomain)
        .exec((err, res: {Items: any[]}) => {
          if(err) {
            reject(err);
          } else {
            resolve(res.Items.map((i) => i.attrs));
          }
        });
    });
  }

  getDeletedNodesByHashedAddress(hashedAddress: string): Promise<DeletedNode[]> {
    return new Promise((resolve, reject) => {
      this.db.DeletedNodes
        .scan()
        .loadAll()
        .where('address').equals(hashedAddress)
        .exec((err, res: {Items: any[]}) => {
          if(err) {
            reject(err);
          } else {
            resolve(res.Items.map((i) => i.attrs));
          }
        });
    });
  }

  createRelayInvoice(invoice: RelayInvoice): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      this.db.RelayInvoices.create(invoice, err => {
        if(err)
          reject(err);
        else
          resolve(true);
      });
    });
  }

  deleteRelayInvoice(id: string): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      this.db.RelayInvoices.destroy({id}, err => {
        if(err)
          reject(err);
        else
          resolve(true);
      });
    });
  }

  getRelayInvoice(id: string): Promise<RelayInvoice|null> {
    return new Promise((resolve, reject) => {
      this.db.RelayInvoices.get(id, (err, res) => {
        if(err) {
          reject(err);
        } else if(res) {
          // @ts-ignore
          const attrs = res.attrs as RelayInvoice;
          resolve(attrs);
        } else {
          resolve(null);
        }
      });
    });
  }

  getRelayInvoicesByUser(user: string, count = 20): Promise<RelayInvoice[]> {
    return new Promise((resolve, reject) => {
      this.db.RelayInvoices
        .query(user)
        .usingIndex('user-date-index')
        .descending()
        .limit(count)
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

}
