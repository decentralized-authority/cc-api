import dynogels from 'dynogels';
import Joi from 'joi';

export const createSessionTokenModel = (tableName: string) => dynogels.define('SessionToken', {
  hashKey: 'token',
  tableName,
  indexes: [
    {name: 'user-token-index', hashKey: 'user', rangeKey: 'token', type: 'global'},
  ],
  timestamps: true,
  schema: {
    // @ts-ignore
    token: Joi.string(),
    // @ts-ignore
    user: Joi.string(),
    // @ts-ignore
    expiration: Joi.string(),
  },
});
