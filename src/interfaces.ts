import { Account } from 'aws-sdk';

export interface Invitation {
  id: string
  expiration: string
  email: string
}

export interface ChainHost {
  id: string
  host: string
}

export interface GatewayHosts {
  id: string
  hosts: string[]
}

export interface Node {
  id: string
  address: string
  user: string
}

export interface ChainBilling {
  date: number
  perc: number
}
export interface Chain {
  id: string
  name: string
  portalPrefix: string
  ticker: string
  description: string
  blockchain: string
  allowance: number
  authRpcEndpoint?: string
  enabled: boolean
  isPartnerChain: boolean
  billing: ChainBilling[]
}

export interface PoktAccount {
  address: string
  publicKey: string
  privateKeyEncrypted: string
}

export interface RpcEndpoint {
  id: string
  gateway: string
  chainId: string
  protocol: 'http'
  address: string
  port: number
  disabled: boolean
}

export interface UserChainHost {
  host: string
  user: string
  chain: string
}

export interface UserDomain {
  user: string
  domain: string
}

export interface DeletedAccount extends Account {
  deletedAt: string
}
export interface DeletedUserDomain extends UserDomain {
  deletedAt: string
}
export interface DeletedNode extends Node {
  deletedAt: string
}

export interface RoutingTablesChange {
  user: string
  type: string
  chains: string[]
}

export interface RelayInvoiceRelays {
  chain: string
  sessionRelays: string
  sessionRewards: string
  relays: string
  rewardsPerc: number
  rewardsAmt: string
  providerBreakdown: {[provider: string]: string}
}
export interface RelayInvoice {
  id: string
  user: string
  date: number
  total: string
  txid?: string
  providersPaid: boolean
  ccPaid: boolean
  relays: RelayInvoiceRelays[]
}

export interface ApiKey {
  id: string
  accountId: string
  hash: string
  salt: string
  name: string
  type: "GATEWAY"|"USER"
  level: number // 0 - no access, 1 - read, 2 - read/write
}

export interface GeneralRelayLog {
  gateway: string
  time: number
  start: number
  end: number
  relays: {[chainId: string]: number}
}

export interface PaymentRelays {
  chain: string                           // relay chain id
  relays: string                          // number of relays for chain
  percent: number                         // provider percentage of rewards e.g. 10% at this point
  reward: string                          // calculated provider payment amount in uPOKT
  breakdown: {[region: string]: string}   // breakdown of rewards by region i.e. region -> number of relays
}

export interface CCPayment {
  id: string                              // payment id
  invoices: string[]                       // user invoice ids
  date: number                            // payment date
  total: string                           // payment total in uPOKT
  txid?: string                            // POKT txid
  relays: PaymentRelays[]                 // relay payment breakdowns
}

export interface ProviderPayment extends CCPayment {
  provider: string                        // provider id
}

export interface ProviderPaymentReceipt {
  id: string                              // payment id
  date: string                            // payment date
  total: string                           // payment total in uPOKT
  txid: string                           // POKT txid
  relays: PaymentRelays[]                 // relay payment breakdowns
}
