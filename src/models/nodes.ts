import dynogels from 'dynogels';
import Joi from 'joi';

export const createNodeModel = (tableName: string) => dynogels.define('Node', {
  hashKey: 'id',
  indexes: [
    {name: 'user-address-index', hashKey: 'user', rangeKey: 'address', type: 'global'},
  ],
  tableName,
  timestamps: true,
  schema: {
    // @ts-ignore
    id: Joi.string(),
    // @ts-ignore
    address: Joi.string(), // will match id for partner nodes
    // @ts-ignore
    note: Joi.string(),
    // @ts-ignore
    user: Joi.string(),
    // @ts-ignore
    chains: Joi.string(),
    // @ts-ignore
    isPartnerNode: Joi.boolean(), // indicates that this is a partner node, not a POKT node
  },
});
