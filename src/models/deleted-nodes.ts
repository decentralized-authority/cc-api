import dynogels from 'dynogels';
import Joi from 'joi';

export const createDeletedNodeModel = (tableName: string) => dynogels.define('DeletedNode', {
  hashKey: 'id',
  tableName,
  timestamps: true,
  schema: {
    // @ts-ignore
    id: Joi.string(),
    // @ts-ignore
    address: Joi.string(),
    // @ts-ignore
    note: Joi.string(),
    // @ts-ignore
    user: Joi.string(),
    // @ts-ignore
    deletedAt: Joi.string(),
  },
});
