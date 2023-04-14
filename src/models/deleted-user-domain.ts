import dynogels from 'dynogels';
import Joi from 'joi';

export const createDeletedUserDomainModel = (tableName: string) => dynogels.define('DeletedUserDomain', {
  hashKey: 'user',
  rangeKey: 'domain',
  tableName,
  timestamps: true,
  schema: {
    // @ts-ignore
    user: Joi.string(),
    // @ts-ignore
    domain: Joi.string(),
    // @ts-ignore
    deletedAt: Joi.string(),
  },
});
