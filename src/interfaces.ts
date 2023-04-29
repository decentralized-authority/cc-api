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
}
export interface RelayInvoice {
  id: string
  user: string
  date: number
  total: string
  txid?: string
  relays: RelayInvoiceRelays[]
}
