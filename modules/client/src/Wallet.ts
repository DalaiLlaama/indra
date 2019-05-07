import { ethers as eth } from 'ethers';
import Web3 from 'web3';
import { ConnextClientOptions } from './Connext';
import {
  TransactionRequest,
  TransactionResponse,
  objMapPromise
} from './types';
import { TransactionConfig } from 'web3-core';

export default class Wallet extends eth.Signer {
  address: string
  provider: eth.providers.BaseProvider
  signer?: eth.Wallet
  web3?: Web3
  private password: string

  constructor(opts: ConnextClientOptions) {
    super()
    this.password = opts.password || ''

    ////////////////////////////////////////
    // Connect to an eth provider

    // First choice: use provided ethUrl
    if (opts.ethUrl) {
      this.provider = new eth.providers.JsonRpcProvider(opts.ethUrl)

    // Second choice: use provided web3
    } else if (opts.web3Provider) {
      this.provider = new eth.providers.Web3Provider(opts.web3Provider)
    // Default: use hub's ethprovider (derived from hubUrl)
    } else {
      const ethUrl = `${opts.hubUrl.substring(0, opts.hubUrl.length - 4)}/eth`
      this.provider = new eth.providers.JsonRpcProvider(ethUrl)
    }

    ////////////////////////////////////////
    // Setup our a signer

    // First choice: Sign w private key
    if (opts.privateKey) {
      this.signer = new eth.Wallet(opts.privateKey || '')
      this.signer = this.signer.connect(this.provider)
      this.address = this.signer.address.toLowerCase()

    // Second choice: Sign w mnemonic
    } else if (opts.mnemonic) {
      this.signer = eth.Wallet.fromMnemonic(opts.mnemonic || '')
      this.signer = this.signer.connect(this.provider)
      this.address = this.signer.address.toLowerCase()

    // Third choice: Sign w web3
    } else if (opts.user && opts.web3Provider) {
      // TODO: Web3Provider != Web3EthereumProvider
      this.web3 = new Web3(opts.web3Provider as any)
      this.address = opts.user.toLowerCase()
      this.web3.eth.defaultAccount = this.address

    // Default: create new random mnemonic
    } else {
      this.signer = eth.Wallet.createRandom()
      this.signer = this.signer.connect(this.provider)
      this.address = this.signer.address.toLowerCase()
      console.warn(`Generated a new signing key, make sure you back it up before sending funds`)
    }
  }

  async getAddress() {
    return this.address
  }

  async signMessage(message: string) {
    const bytes = eth.utils.isHexString(message)
      ? eth.utils.arrayify(message)
      : eth.utils.toUtf8Bytes(message)

    if (this.signer) {
      return await this.signer.signMessage(bytes)
    }
    if (this.web3) {
      let sig

      // Modern versions of web3 will add the standard ethereum message prefix for us 
      sig = await this.web3.eth.sign(eth.utils.hexlify(bytes), this.address)
      if (this.address === eth.utils.verifyMessage(bytes, sig).toLowerCase()) {
        return sig
      }

      // Old versions of web3 did not, we'll add it ourself
      sig = await this.web3.eth.sign(eth.utils.hashMessage(bytes), this.address)
      if (this.address === eth.utils.verifyMessage(bytes, sig).toLowerCase()) {
        return sig
      }

      // Weird version of web3 that does something else? idk then
      throw new Error(`Couldn't find a web3 signing method that works...`)
    }
    throw new Error(`Could not sign message`)
  }

  async signTransaction(tx: TransactionRequest): Promise<string> {
    if (this.signer) {
      return await this.signer.sign(tx)
    }
    if (this.web3) {
      // resolve any fields
      const resolved = await objMapPromise(tx, async (k, v) => await v) as any
      // convert to right object
      const txObj: TransactionConfig = {
        from: this.address,
        to: resolved.to,
        value: resolved.value,
        gas: parseInt(resolved.gasLimit),
        gasPrice: resolved.gasPrice,
        data: resolved.data,
      }
      return (await this.web3.eth.signTransaction(txObj)).raw // TODO: fix type
    }
    throw new Error(`Could not sign transaction`)
  }

  async sendTransaction(txReq: TransactionRequest): Promise<TransactionResponse> {
    if (txReq.nonce == null && this.signer) {
      txReq.nonce = this.signer!.getTransactionCount("pending"); 
    }
    // TransactionRequest properties can be promises, make sure they've all resolved
    const tx = await objMapPromise(txReq, async (k, v) => await v) as any

    const signedTx = await this.signTransaction(tx)
    return await this.provider.sendTransaction(signedTx)
  }

}

