export interface Invitation {
  id: string
  expiration: string
  email: string
}

export interface ChainUrl {
  id: string
  url: string
}

export interface GatewayNode {
  id: string
  chains: ChainUrl[]
}

export interface Node {
  id: string
  address: string
  user: string
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
