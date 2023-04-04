import dynogels from 'dynogels';
import Joi from 'joi';

export const createUserChainHostModel = (tableName: string) => dynogels.define('UserChainHost', {
  hashKey: 'host',
  tableName,
  timestamps: true,
  schema: {
    // @ts-ignore
    host: Joi.string(),
    // @ts-ignore
    user: Joi.string(),
  },
});
