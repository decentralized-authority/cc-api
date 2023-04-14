import dynogels from 'dynogels';
import Joi from 'joi';

export const createUserDomainModel = (tableName: string) => dynogels.define('UserDomain', {
  hashKey: 'user',
  rangeKey: 'domain',
  tableName,
  timestamps: true,
  schema: {
    // @ts-ignore
    user: Joi.string(),
    // @ts-ignore
    domain: Joi.string(),
  },
});
