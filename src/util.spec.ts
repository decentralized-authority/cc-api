import should from 'should';
import {
  combinedKeyIdLength, combinedKeyPatt,
  combinedKeySeparator,
  createPoktAccount, generateCombinedApiKey,
  generateId,
  generateSalt,
  goodBody,
  goodEmail,
  goodPassword,
  hashPassword,
  httpErrorResponse,
  httpResponse, poktAddressFromPublicKey, sha256, splitCombinedApiKey
} from './util';
import isString from 'lodash/isString';

describe('util', function() {

  this.timeout(30000);

  describe('httpErrorResponse()', function() {
    it('should return an APIGatewayProxyResult', function() {
      const statusCode = 400;
      const errorMessage = 'some error message';
      const res = httpErrorResponse(statusCode, errorMessage);
      res.statusCode.should.equal(statusCode);
      res.body.should.equal(JSON.stringify(errorMessage));
      // @ts-ignore
      res.headers.should.be.an.Object();
      // @ts-ignore
      res.headers['Access-Control-Allow-Origin'].should.equal('*');
    });
  });

  describe('httpResponse()', function() {
    it('should return an APIGatewayProxyResult', function() {
      const statusCode = 200;
      const body = {some: 'thing'};
      const res = httpResponse(statusCode, body);
      res.statusCode.should.equal(statusCode);
      res.body.should.equal(JSON.stringify(body, null, '  '));
      // @ts-ignore
      res.headers.should.be.an.Object();
      // @ts-ignore
      res.headers['Access-Control-Allow-Origin'].should.equal('*');
    });
  });

  describe('goodBody()', function() {
    it('should check if an http body is valid', function() {
      const badBodies = [
        undefined,
        '',
        '{some:thing',
      ];
      for(const body of badBodies) {
        goodBody(body).should.be.False();
      }
      goodBody('["valid","json"]', isString).should.be.False();
      goodBody('["valid","json"]').should.be.True();
    });
  });

  describe('goodEmail()', function() {
    it('should check if an email address is valid', function() {
      const badAddresses = [
        undefined,
        '',
        'som@bad',
        'somebad.email',
      ];
      for(const email of badAddresses) {
        goodEmail(email).should.be.False();
      }
      goodEmail('some@email.com').should.be.True();
      goodEmail('some.thing1@email.domain4.com').should.be.True();
    });
  });

  describe('goodPassword()', function() {
    it('should check if a password is valid', function() {
      const badPasswords = [
        undefined,
        1,
        '',
        '                                 ',
        'shortpw',
      ];
      for(const password of badPasswords) {
        // @ts-ignore
        goodPassword(password).should.be.False();
      }
      goodPassword('123456789012').should.be.True();
      goodPassword('abcd12344*"@!').should.be.True();
      goodPassword('12345678901234567890').should.be.True();
    });
  });

  describe('generateId()', function() {
    it('should generate a new ID', function() {
      const id = generateId();
      id.should.be.a.String();
      /^[0123456789abcdef]{32}$/.test(id).should.be.True();
    });
  });

  describe('generateSalt()', function() {
    it('should generate salt', function() {
      {
        const salt = generateSalt();
        salt.should.be.a.String();
        /^[0123456789abcdef]{32}$/.test(salt).should.be.True();
      }
      {
        const salt = generateSalt(32);
        salt.should.be.a.String();
        /^[0123456789abcdef]{64}$/.test(salt).should.be.True();
      }
    });
  });

  describe('hashPassword()', function() {
    it('should hash a password', function() {
      {
        const hashed = hashPassword('somepassword', 'somesalt');
        hashed.should.be.a.String();
        /^[0123456789abcdef]+$/.test(hashed).should.be.True();
      }
    });
  });

  describe('sha256()', function() {
    it('should sha256 hash a string', function() {
      {
        const hashed = sha256('somestring', 'utf8');
        hashed.should.be.a.String();
        /^[0123456789abcdef]{64}$/.test(hashed).should.be.True();
      }
    });
  });

  describe('poktAddressFromPublicKey()', function() {
    it('should generate an address from a POKT public key', function() {
      {
        const address = poktAddressFromPublicKey('b40ff767f50702abb709ecdb8ce09f12f0a6e7d0ea9954d9c86b61616fffb47c');
        address.should.equal('acbb6fc459b17faabafd8d0fb4e61474398dd351');
      }
    });
  });

  describe('createPoktAccount()', function() {
    it('should generate a new POKT account', async function() {
      {
        const account = await createPoktAccount();
        account.should.be.an.Object();
        account.privateKey.should.be.a.String();
        /^[0123456789abcdef]{128}$/.test(account.privateKey).should.be.True();
        account.publicKey.should.be.a.String();
        /^[0123456789abcdef]{64}$/.test(account.publicKey).should.be.True();
        account.address.should.be.a.String();
        /^[0123456789abcdef]{40}$/.test(account.address).should.be.True();
      }
    });
  });

  const apiKey = generateId();
  let apiKeyId = '';
  let combinedKey = '';

  describe('generateCombinedApiKey()', function() {
    it('should generate a combined API key', function() {
      combinedKey = generateCombinedApiKey(apiKey);
      should(combinedKey).be.a.String();
      const splitKey = combinedKey.split(combinedKeySeparator);
      splitKey.length.should.equal(2);
      apiKeyId = splitKey[0];
      splitKey[0].length.should.equal(combinedKeyIdLength);
      splitKey[1].should.equal(apiKey);
      combinedKeyPatt.test(combinedKey).should.be.True();
    });
  });

  describe('splitCombinedApiKey()', function() {
    it('should split a combined API key into the id and key', function () {
      const splitKey = splitCombinedApiKey(combinedKey);
      should(splitKey).be.an.Array();
      splitKey.length.should.equal(2);
      splitKey[0].should.equal(apiKeyId);
      splitKey[1].should.equal(apiKey);
    });
  });

});
