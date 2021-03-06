import { ethers as eth } from 'ethers'

import { BN } from './lib'
import { address, assert, ethUrl, mnemonic, privateKey } from './testing'
import { Utils } from './Utils'
import { Wallet } from './Wallet'

const hubUrl: string = ''
const utils: Utils = new Utils()

////////////////////////////////////////
// Helper Functions

const testSignMessage: any = async (wallet: Wallet): Promise<void> => {
  const msg: string = eth.utils.hexlify(eth.utils.randomBytes(32))
  const sig: string = await wallet.signMessage(msg)
  const recovered: string = utils.recoverSigner(msg, sig, wallet.address) || ''
  assert.equal(recovered, wallet.address)
}

const testSendTransaction: any = async (wallet: Wallet): Promise<void> => {
  const value = eth.utils.parseEther('0.01')
  const nonceBefore: number = await wallet.provider.getTransactionCount(wallet.address)
  const balanceBefore: BN = await wallet.provider.getBalance(wallet.address)
  const tx: any = await wallet.sendTransaction({
    gasLimit: 21000,
    gasPrice: await wallet.provider.getGasPrice(),
    to: eth.constants.AddressZero,
    value,
  })
  wallet.provider.pollingInterval = 100 // default is 4000 which causes test to time out
  await wallet.provider.waitForTransaction(tx.hash)
  const nonceAfter: number = await wallet.provider.getTransactionCount(wallet.address)
  const balanceAfter: BN = await wallet.provider.getBalance(wallet.address)
  assert(balanceAfter.lt(balanceBefore.sub(value))) // lt bc we also pay some amount of gas
  assert(nonceAfter === nonceBefore + 1)
}

////////////////////////////////////////
// Tests

describe('Wallet', () => {

  it('should sign messages properly with a private key', async () => {
    testSignMessage(new Wallet({ hubUrl, privateKey }))
  })

  it('should sign messages properly with a mnemonic', async () => {
    testSignMessage(new Wallet({ hubUrl, mnemonic }))
  })

  it('should sign transactions properly with a private key', async () => {
    testSendTransaction(new Wallet({ hubUrl, ethUrl, privateKey }))
  })

  it('should sign transactions properly with a mnemonic', async () => {
    testSendTransaction(new Wallet({ hubUrl, ethUrl, mnemonic }))
  })

  it('should throw an error if not given a signing method', async () => {
    assert.throws(() => new Wallet({ hubUrl }))
  })

})
