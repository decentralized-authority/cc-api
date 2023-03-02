import dynogels from 'dynogels';
import Joi from 'joi';

export const createRpcEndpointModel = (tableName: string) => dynogels.define('RpcEndpoint', {
  hashKey: 'id',
  indexes: [
    {name: 'gateway-id-index', hashKey: 'gateway', rangeKey: 'id', type: 'global'},
  ],
  tableName,
  timestamps: true,
  schema: {
    // @ts-ignore
    id: Joi.string(),
    // @ts-ignore
    gateway: Joi.string(),
    // @ts-ignore
    chainId: Joi.string(),
    // @ts-ignore
    protocol: Joi.string(),
    // @ts-ignore
    address: Joi.string(),
    // @ts-ignore
    port: Joi.number(),
    // @ts-ignore
    disabled: Joi.boolean(),
    // @ts-ignore
    autoTimeout: Joi.number(), // the start time of the auto timeout
  },
});
