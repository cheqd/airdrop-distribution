import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing'
import { assertIsDeliverTxSuccess, SigningStargateClient } from '@cosmjs/stargate'

const MINIMAL_DENOM = 10**9
const MINIMAL_DENOM_LITERAL = 'ncheq'
const MAINNET_BLOCK_EXPLORER = 'https://explorer.cheqd.io'
const GAS_PRICE = GasPrice.fromString("25ncheq")

const mnemonic = process.env.CF_DISTRIBUTOR_1_MNEMONIC

var state = {
  distributor_1: {
    busy: false
  },
  distributor_2: {
    busy: false
  },
}

addEventListener('scheduled', event => {
  event.waitUntil(handleScheduled(event));
})

async function handleScheduled(event) {
  return await process_queue()
}

async function process_queue() {
  const list = await list_pending_transactions()

  return process_transactions( list )
}

async function list_pending_transactions() {
  return ( await withdrawal_transactions_queue.list() ).keys
}

async function process_transactions(keys) {
  for( let [i, key] of keys.entries() ){
    const recipient = key.name
    const pending_transaction = JSON.parse( await withdrawal_transactions_queue.get( key.name ) )

    const { tx_hash } = await broadcast_tx( recipient, pending_transaction.amount )

    await enlist_successful_withdrawal( recipient, tx_hash, pending_transaction.amount )

    await delete_processed_enqueued_transaction( recipient )
  }

  return true
}

async function enlist_successful_withdrawal(address, tx_hash, amount) {
  const date = new Date()
  let entry = JSON.parse( await community_airdrop.get( address ) )
  const diff = Number( entry.reward ) - Number( amount )

  entry.reward = Number( entry.reward ) - Number( amount ) > 0 ? diff : 0 

  entry.withdrawals.successful_withdrawals.push(
    {
      amount: amount,
      tx_hash: tx_hash,
      tx_explorer_link: `${MAINNET_BLOCK_EXPLORER}/transactions/${tx_hash}`,
      timestamp: date.getTime(),
      human_readable_date: date.toISOString()
    }
  )

  await community_airdrop.put( 
    address,
    JSON.stringify(
      entry
    )
  )

  return true
}

async function delete_processed_enqueued_transaction(address) {
  await withdrawal_transactions_queue.delete( address )

  return true
}

async function broadcast_tx(recipient, amount_in_maximal_denom) {
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic( mnemonic, { prefix: 'cheqd' } )

  const [ account ] = await wallet.getAccounts()

  const client = await SigningStargateClient.connectWithSigner( RPC_ENDPOINT, wallet )

  const amount = {
    denom: MINIMAL_DENOM_LITERAL,
    amount: String( Number( amount_in_maximal_denom ) * MINIMAL_DENOM )
  }

  const result = await client.sendTokens(
    account.address,
    recipient,
    [ amount ],
    "auto",
  )

  assertIsDeliverTxSuccess( result )

  return {
    tx_hash: result.transactionHash
  }
}
