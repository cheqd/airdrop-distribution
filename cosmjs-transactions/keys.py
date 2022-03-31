import subprocess
import json

_keys = subprocess.run( [ 'wrangler', 'kv:key', 'list', '--binding', 'withdrawal-queue-test' ], shell=True, stdout=subprocess.PIPE )
keys = len( json.loads( _keys.stdout.decode( 'utf-8' ) ) )

print( f'withdrawal-queue-test: {keys}' )
