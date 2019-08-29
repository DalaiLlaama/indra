import { assert, expect } from 'chai'
import { ethers as eth } from 'ethers'

import { MerkleTree } from './lib'
import * as testUtils from './testing'
import {
  ChannelState,
  Provider,
  ThreadState,
} from './types'
import { Utils } from './Utils'

const mnemonic: string =
  'candy maple cake sugar pudding cream honey rich smooth crumble sweet treat'
const provider: string = process.env.ETH_RPC_URL || 'http://localhost:8545'
const utils: Utils = new Utils()
const wallet: eth.Wallet = eth.Wallet.fromMnemonic(mnemonic)

describe('Utils', () => {

  it('should properly recover the signer from the channel state update hash', async () => {
    const hash: string = utils.createChannelStateHash(
      testUtils.getChannelState('full', { balanceWei: [1, 2], user: wallet.address }),
    )

    // sign using all available methods
    const sigs = [{
        method: 'wallet.signMessage',
        sig: await wallet.signMessage(eth.utils.arrayify(hash)),
        signer: wallet.address,
    }]

    // recover signers
    for (const s of sigs) {
      const recovered: string|undefined = utils.recoverSigner(hash, s.sig, s.signer.toLowerCase())
      expect(recovered, `Testing with signing method: ${s.method}`).to.equal(s.signer.toLowerCase())
    }
  })

  it('should recover the signer from the thread state update', async () => {
    const hash: string = utils.createThreadStateHash(
      testUtils.getThreadState('full', { balanceWei: [1, 2] }),
    )

    // sign using all available methods
    const sigs = [
      {
        method: 'wallet.signMessage',
        sig: await wallet.signMessage(eth.utils.arrayify(hash)),
        signer: wallet.address,
      },
    ]

    // recover signers
    for (const s of sigs) {
      const recovered: string|undefined = utils.recoverSigner(hash, s.sig, s.signer.toLowerCase())
      expect(recovered, `Testing with signing method: ${s.method}`).to.equal(s.signer.toLowerCase())
    }
  })

  it('should return the correct root hash', async () => {
    const threadState: ThreadState = testUtils.getThreadState('empty', {
      balanceWei: [1, 2],
    })
    const threadHash: string = utils.createThreadStateHash(threadState)
    const expectedRoot: string = (new MerkleTree([threadHash])).root
    const generatedRootHash: string = utils.generateThreadRootHash([ threadState ])
    expect(generatedRootHash).to.equal(expectedRoot)
  })

  it('should correctly verify thread proofs', async () => {
    const threadStates: ThreadState[] = [
      testUtils.getThreadState('empty', { balanceWei: [1, 2] }),
      testUtils.getThreadState('empty', { balanceWei: [3, 4] }),
      testUtils.getThreadState('empty', { balanceWei: [5, 6] }),
    ]
    const proof: string = utils.generateThreadProof(threadStates[0], threadStates)
    assert(utils.verifyThreadProof(proof, threadStates))
  })

  describe('hasPendingOps', () => {
    for (const testCase of [
      { input: { balanceWeiHub: '0', pendingDepositTokenHub: '0' }, expected: false },
      { input: { balanceWeiHub: '1', pendingDepositTokenHub: '0' }, expected: false },
      { input: { balanceWeiHub: '0', pendingDepositTokenHub: '1' }, expected: true },
      { input: { balanceWeiHub: '1', pendingDepositTokenHub: '1' }, expected: true },
    ]) {
      it(`${JSON.stringify(testCase.input)} => ${testCase.expected}`, () => {
        assert.equal(utils.hasPendingOps(testCase.input as ChannelState), testCase.expected)
      })
    }
  })

})
