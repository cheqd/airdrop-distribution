const BASE_NETWORK = 'cheqd'

const NETWORKS = {
  cosmos:   'https://lcd-cosmoshub.blockapsis.com',
  cheqd:    'https://api.cheqd.net',
  osmo:     'https://lcd-osmosis.blockapsis.com',
  juno:     'https://lcd-juno.itastakers.com'
}

const HEADERS = {
  json: { 'Content-Type': 'application/json' },
  text: { 'Content-Type': 'text/plain' },
}

const MESSAGES = {
  invalid: 'Invalid address provided or not qualified for this stage of the airdrop.',
  valid: 'Thank you for participating on this round! Your transaction will be processed in the next 24 hours.'
}

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})
/**
 * Respond with hello worker text
 * @param {Request} request
 */
async function handleRequest(request) {
  const url = parse_url_to_base_class(request.url)
  const address = url.pathname.replace('/claim/','').replace('/','')

  if( !address || !validate_address( address ) || !( await validate_account( address ) ) || await is_denied( address ) || !( await is_qualified( address ) ) ) return new Response( JSON.stringify( {valid: false, message: MESSAGES.invalid} ), { headers: HEADERS.json } )

  const claim = await process_claim( address )

  if( !claim ) return new Response( JSON.stringify( {valid: false, message: MESSAGES.invalid} ), { headers: HEADERS.json } )

  return new Response(
    JSON.stringify(
      {
        valid: true,
        message: MESSAGES.valid
      }
    ),
    {
      headers: HEADERS.json
    }
  )
}

async function process_claim(address) {
  let entry = await fetch_qualified_entry( address )

  if( has_submitted_a_withdrawal( address ) ) return false

  return await enqueue_transaction( entry.address, entry.entry )
}

function parse_url_to_base_class(url) {
  return new URL(url)
}

async function is_denied(address) {
  const denylist = Object.keys( JSON.parse( await community_airdrop.get( 'denylist' ) ) )

  for( let entry of denylist ){
    if( entry === address ) return true
  }

  return false
}

function validate_address(address) {
  for( let n of Object.keys(NETWORKS)){
    if( RegExp(`^(${n})1[a-z0-9]{38}$`).test(address) ) return true
  }
  return false
}

async function validate_account(address) {
  for( let n of Object.keys(NETWORKS)){
    if( RegExp(`^(${n})`).test(address) && ( await fetch_account( address, NETWORKS[ n ] ) )?.account ) return true
  }
  return false
}

function is_base_network(address) {
  if( !RegExp(`^(${BASE_NETWORK})`).test(address) ) return false

  return true
}

async function fetch_account(address, endpoint) {
  return await fetch(
    `${endpoint}/cosmos/auth/v1beta1/accounts/${address}`
  ).then(function(response){
    return response.json()
  }).catch(function(){
    throw new Error('Invalid address provided or unreachable client.')
  })
}

async function is_qualified(address) {
  if( !address ) return false

  if( !is_base_network( address ) ) address = await community_airdrop.get( address )

  if( !address ) return false

  let entry = JSON.parse( await community_airdrop.get( address ) )

  if( !( entry?.reward > 0 ) ) return false 

  return true
}

async function fetch_qualified_entry(address) {
  if( !is_base_network( address ) ) address = await community_airdrop.get( address )

  return {
    address: address,
    entry: JSON.parse( await community_airdrop.get( address ) )
  }
}

async function has_submitted_a_withdrawal(address) {
  const withdrawal = await withdrawal_transactions_queue.get( address )

  if( !withdrawal ) return false

  return true
}

async function enqueue_transaction(address, entry) {
  try {
    await withdrawal_transactions_queue.put(
      address,
      JSON.stringify(
        {
          amount: entry.reward,
          timestamp: (new Date()).getTime()
        }
      )
    )
  } catch(e) {
    return false
  }

  return true
}
