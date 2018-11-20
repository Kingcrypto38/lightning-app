import { Store } from '../../../src/store';
import NavAction from '../../../src/action/nav-mobile';
import WalletAction from '../../../src/action/wallet';
import AuthAction from '../../../src/action/auth-mobile';

describe('Action AuthMobile Unit Tests', () => {
  let sandbox;
  let store;
  let wallet;
  let nav;
  let auth;
  let SecureStore;
  let Fingerprint;
  let Alert;

  beforeEach(() => {
    sandbox = sinon.createSandbox({});
    store = new Store();
    wallet = sinon.createStubInstance(WalletAction);
    nav = sinon.createStubInstance(NavAction);
    SecureStore = {
      getItemAsync: sinon.stub(),
      setItemAsync: sinon.stub(),
    };
    Fingerprint = {
      hasHardwareAsync: sinon.stub(),
      authenticateAsync: sinon.stub(),
    };
    Alert = {
      alert: sinon.stub(),
    };
    auth = new AuthAction(store, wallet, nav, SecureStore, Fingerprint, Alert);
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('initSetPin()', () => {
    it('should init values and navigate', () => {
      auth.initSetPin();
      expect(store.auth.newPin, 'to equal', '');
      expect(store.auth.pinVerify, 'to equal', '');
      expect(nav.goSetPin, 'was called once');
    });
  });

  describe('initPin()', () => {
    it('should init values and navigate', () => {
      auth.initPin();
      expect(store.auth.pin, 'to equal', '');
      expect(nav.goPin, 'was called once');
    });
  });

  describe('pushPinDigit()', () => {
    it('should add a digit for empty pin', () => {
      auth.pushPinDigit({ digit: '1', param: 'pin' });
      expect(store.auth.pin, 'to equal', '1');
    });

    it('should add no digit for max length pin', () => {
      store.auth.pin = '000000';
      auth.pushPinDigit({ digit: '1', param: 'pin' });
      expect(store.auth.pin, 'to equal', '000000');
    });

    it('should go to next screen on last digit', () => {
      store.auth.newPin = '00000';
      auth.pushPinDigit({ digit: '1', param: 'newPin' });
      expect(store.auth.newPin, 'to equal', '000001');
      expect(nav.goSetPinConfirm, 'was called once');
    });

    it('should not go to next screen on fifth digit', () => {
      store.auth.newPin = '0000';
      auth.pushPinDigit({ digit: '1', param: 'newPin' });
      expect(store.auth.newPin, 'to equal', '00001');
      expect(nav.goSetPinConfirm, 'was not called');
    });
  });

  describe('popPinDigit()', () => {
    it('should remove digit from a pin', () => {
      store.auth.pin = '000000';
      auth.popPinDigit({ param: 'pin' });
      expect(store.auth.pin, 'to equal', '00000');
    });

    it('should not remove a digit from an empty pin', () => {
      store.auth.pin = '';
      auth.popPinDigit({ param: 'pin' });
      expect(store.auth.pin, 'to equal', '');
    });

    it('should go back to SetPassword screen on empty string', () => {
      store.auth.pinVerify = '';
      auth.popPinDigit({ param: 'pinVerify' });
      expect(nav.goSetPin, 'was called once');
    });
  });

  describe('checkNewPin()', () => {
    beforeEach(() => {
      sandbox.stub(auth, '_generateWalletPassword');
    });

    it('should work for two same pins', async () => {
      store.auth.newPin = '000000';
      store.auth.pinVerify = '000000';
      await auth.checkNewPin();
      expect(
        SecureStore.setItemAsync,
        'was called with',
        'DevicePin',
        '000000'
      );
      expect(auth._generateWalletPassword, 'was called once');
    });

    it('should display error for too short pins', async () => {
      store.auth.newPin = '00000';
      store.auth.pinVerify = '00000';
      await auth.checkNewPin();
      expect(Alert.alert, 'was called once');
      expect(SecureStore.setItemAsync, 'was not called');
      expect(auth._generateWalletPassword, 'was not called');
    });

    it('should display error for non matching pins', async () => {
      store.auth.newPin = '000000';
      store.auth.pinVerify = '000001';
      await auth.checkNewPin();
      expect(Alert.alert, 'was called once');
      expect(SecureStore.setItemAsync, 'was not called');
      expect(auth._generateWalletPassword, 'was not called');
    });
  });

  describe('checkPin()', () => {
    beforeEach(() => {
      sandbox.stub(auth, '_unlockWallet');
    });

    it('should work for two same pins', async () => {
      store.auth.pin = '000000';
      SecureStore.getItemAsync.resolves('000000');
      await auth.checkPin();
      expect(auth._unlockWallet, 'was called once');
    });

    it('should display error for non matching pins', async () => {
      store.auth.pin = '000001';
      SecureStore.getItemAsync.resolves('000000');
      await auth.checkPin();
      expect(Alert.alert, 'was called once');
      expect(auth._unlockWallet, 'was not called');
    });
  });

  describe('tryFingerprint()', () => {
    beforeEach(() => {
      sandbox.stub(auth, '_unlockWallet');
    });

    it('should not unlock wallet without hardware support', async () => {
      Fingerprint.hasHardwareAsync.resolves(false);
      await auth.tryFingerprint();
      expect(auth._unlockWallet, 'was not called');
    });

    it('should not unlock wallet if authentication failed', async () => {
      Fingerprint.hasHardwareAsync.resolves(true);
      Fingerprint.authenticateAsync.resolves({ success: false });
      await auth.tryFingerprint();
      expect(auth._unlockWallet, 'was not called');
    });

    it('should unlock wallet if authentication worked', async () => {
      Fingerprint.hasHardwareAsync.resolves(true);
      Fingerprint.authenticateAsync.resolves({ success: true });
      await auth.tryFingerprint();
      expect(auth._unlockWallet, 'was called once');
    });
  });

  describe('_generateWalletPassword()', () => {
    it('should generate a password and store it', async () => {
      await auth._generateWalletPassword();
      expect(
        SecureStore.setItemAsync,
        'was called with',
        'WalletPassword',
        /^[0-9a-f]{64}$/
      );
      expect(store.wallet.newPassword, 'to match', /^[0-9a-f]{64}$/);
      expect(store.wallet.passwordVerify, 'to match', /^[0-9a-f]{64}$/);
      expect(wallet.checkNewPassword, 'was called once');
    });
  });

  describe('_unlockWallet()', () => {
    it('should not unlock wallet without hardware support', async () => {
      SecureStore.getItemAsync.resolves('some-password');
      await auth._unlockWallet();
      expect(SecureStore.getItemAsync, 'was called with', 'WalletPassword');
      expect(store.wallet.password, 'to equal', 'some-password');
      expect(wallet.checkPassword, 'was called once');
    });
  });

  describe('_totallyNotSecureRandomPassword()', () => {
    it('should generate hex encoded 256bit entropy password', async () => {
      const pass = auth._totallyNotSecureRandomPassword();
      expect(pass.length, 'to equal', 64);
    });
  });
});