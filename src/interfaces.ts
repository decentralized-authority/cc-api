export interface Invitation {
  id: string
  expiration: string
  email: string
}

export interface NodeChain {
  id: string
  url: string
}

export interface GatewayNode {
  id: string
  chains: NodeChain[]
}

export interface Node {
  id: string
  address: string
  user: string
  chains: NodeChain[]
  isPartnerNode: boolean
}

export interface Chain {
  id: string
  name: string
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
