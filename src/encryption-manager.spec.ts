import 'should';
import { EncryptedObject, EncryptionManager } from './encryption-manager';

describe('EncryptionManager', function() {

  this.timeout(30000);

  const clearText = 'here is some clear text';
  let encrypted: string;
  let encryptionManager: EncryptionManager;

  before(function() {
    encryptionManager = new EncryptionManager('someencryptionpassword');
  });

  describe('.encrypt()', function() {
    it('should encrypt a string', function() {
      encrypted = encryptionManager.encrypt(clearText);
      encrypted.should.be.a.String();
      const encryptedObj: EncryptedObject = JSON.parse(encrypted);
      encryptedObj.algorithm.should.be.a.String();
      encryptedObj.keylen.should.be.a.Number();
      encryptedObj.salt.should.be.a.String();
      encryptedObj.iv.should.be.a.String();
      encryptedObj.encrypted.should.be.a.String();
    });
  });

  describe('.decrypt()', function() {
    it('should decrypt a string', function() {
      const decrypted = encryptionManager.decrypt(encrypted);
      decrypted.should.be.a.String();
      decrypted.should.equal(clearText);
    });
  });

});
