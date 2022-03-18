import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing'
import { assertIsDeliverTxSuccess, SigningStargateClient, GasPrice } from '@cosmjs/stargate'
import asyncPool from 'tiny-async-pool'

const MINIMAL_DENOM = 10**9
const MINIMAL_DENOM_LITERAL = 'ncheq'
const MAINNET_BLOCK_EXPLORER = 'https://explorer.cheqd.io'
const GAS_PRICE = GasPrice.fromString( `25${MINIMAL_DENOM_LITERAL}` )

const MAX_PROCESSING_LIMIT = CF_NUMBER_OF_DISTRIBUTORS * CF_MAX_SAFE_TX_PER_BLOCK * 6 // With 6 being the *average* block time. Avoided to add another GraphQL call on top.
const MNEMONICS = (function() {
  return String( ***REMOVED*** ).split(',').map(
    function(_d,_){
      if( !_d ) throw new Error(`Distributor #${_} mnemonic is not set. Exiting.`)

      return _d
    }
  )
})()

addEventListener('scheduled', event => {
  event.waitUntil(handleScheduled(event));
})

async function handleScheduled(event) {
  await process_queue()

  return true
}

async function process_queue() {
  const list = await catch_rejections( list_pending_transactions )

  if( !list ) return true

  return process_transactions( list )
}

async function catch_rejections(callable) {
  try {
    return await callable()
  } catch(e) {
    return false
  }
}

async function list_pending_transactions() {
  return ( await withdrawal_transactions_queue.list( { limit: MAX_PROCESSING_LIMIT } ) ).keys
}

async function process_transactions(keys) {
  let transactions = []

  for( let [i, key] of keys.entries() ){
    const recipient = key.name
    const pending_transaction = JSON.parse( await withdrawal_transactions_queue.get( recipient ) )

    transactions.push(
      {
        recipient: recipient,
        amount: pending_transaction.amount,
        assigned_to_distributor: transactions.length
      }
    )

    if( ( i + 1 ) % CF_NUMBER_OF_DISTRIBUTORS === 0 ){
      const tx_hashes = await process_pool( transactions )

      transactions.length = 0
    }
  }

  if( transactions.length > 0 ) await process_pool( transactions )

  // No need to reset enqueued transactions array. End of execution.

  return true
}

async function process_pool(transactions) {
  return await asyncPool(
    transactions.length < CF_NUMBER_OF_DISTRIBUTORS ? transactions.length : CF_NUMBER_OF_DISTRIBUTORS,
    transactions,
    execute_transactional_logic
  )
}

async function execute_transactional_logic(transaction) {
  return new Promise(
    async function(resolve){
      try {
        const { recipient, amount, assigned_to_distributor } = transaction
        const { tx_hash } = await broadcast_tx( recipient, amount, assigned_to_distributor )

        await enlist_successful_withdrawal( recipient, tx_hash, amount )

        await delete_processed_enqueued_transaction( recipient )

        resolve( tx_hash )
      } catch(e) {
        resolve( undefined )
      }
    }
  )
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

  entry.withdrawals.total_withdrawals = Number( entry.withdrawals.total_withdrawals || 0 ) + 1

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

async function broadcast_tx(recipient, amount_in_maximal_denom, distributor_number) {
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic( MNEMONICS[ distributor_number ], { prefix: 'cheqd' } )

  const [ account ] = await wallet.getAccounts()

  const client = await SigningStargateClient.connectWithSigner( CF_RPC_ENDPOINT, wallet, { gasPrice: GAS_PRICE } )

  const amount = {
    denom: MINIMAL_DENOM_LITERAL,
    amount: String( Number( amount_in_maximal_denom ) * MINIMAL_DENOM )
  }

  const result = await client.sendTokens(
    account.address,
    recipient,
    [ amount ],
    'auto',
  )

  assertIsDeliverTxSuccess( result )

  return {
    tx_hash: result.transactionHash
  }
}
