import subprocess
import json

_keys = subprocess.run( [ 'wrangler', 'kv:key', 'list', '--binding', 'withdrawal_transactions_queue' ], shell=True, stdout=subprocess.PIPE )
keys = len( json.loads( _keys.stdout.decode( 'utf-8' ) ) )

print( f'withdrawal_transactions_queue: {keys}' )
