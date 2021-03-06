import {
	APIGatewayProxyEventV2,
	APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';
import snakeCaseKeys from 'snakecase-keys';
import { Logger } from 'tslog';

import createApp from './app';
import router from './rpc/router';
import { Config } from './types';
import Squawk from './utils/squawk';

// These are local testing keys, nice try ;)

const jwtPrivateKeyTest = `-----BEGIN EC PRIVATE KEY-----
MIHcAgEBBEIB5gqMiYlWqZI/yJec3oCljbAn6SH4RyRIhjG6eJEHpFGFuRbiYyk8
XFz+FWdqDUQnQqhluSU3b0cCEqOwhoZ9M9qgBwYFK4EEACOhgYkDgYYABAAm3osJ
/vGKbnoRqeXa3eRgASoCCJ6JHv3O0wxyGM161X5W+G2zHaSn9QmnrJ0Ba39T+Hsu
e7+J7BEYhkGMlWg3EAGpMHYf7GLuCUT25TN+iZiIlXNtDK8vwLCi6ozbGl+jCkh2
shark0UnFEsQ45alBErdtdb88iSyzZkQrrlfwiM1Sg==
-----END EC PRIVATE KEY-----`;

const jwtPublicKeyTest = `-----BEGIN PUBLIC KEY-----
MIGbMBAGByqGSM49AgEGBSuBBAAjA4GGAAQAJt6LCf7xim56Eanl2t3kYAEqAgie
iR79ztMMchjNetV+Vvhtsx2kp/UJp6ydAWt/U/h7Lnu/iewRGIZBjJVoNxABqTB2
H+xi7glE9uUzfomYiJVzbQyvL8CwouqM2xpfowpIdrIWq5NFJxRLEOOWpQRK3bXW
/PIkss2ZEK65X8IjNUo=
-----END PUBLIC KEY-----`;

function getConfig(): Config {
	const env = process.env.APP_ENV ?? 'local';
	const internalKey = process.env.INTERNAL_KEY ?? 'test';

	const [jwtPrivateKey, jwtPublicKey] = (function readJwtEnv() {
		const jwtKeys = process.env.JWT_KEYS;

		if (!jwtKeys && env !== 'prod')
			return [jwtPrivateKeyTest, jwtPublicKeyTest];

		if (!jwtKeys)
			throw new Squawk('jwt_keys_not_set');

		const { privateKey, publicKey } = JSON.parse(jwtKeys);

		return [privateKey, publicKey];
	}());

	if (internalKey === 'test' && env === 'prod')
		throw new Squawk('internal_key_not_set');

	return {
		env,
		jwtPrivateKey,
		jwtPublicKey,
		internalKey,
		mongoUri: process.env.MONGO_URI ?? 'mongodb://localhost/local-nest-beak',
		stpSecretKey: process.env.STRIPE_SECRET_KEY ?? '',
	};
}

const logger = new Logger();
const app = createApp(getConfig());

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> => {
	await app.dbClient.connect();

	try {
		const response = await router(logger, app, event);

		if (!response)
			return createResponse(204);

		return createResponse(200, JSON.stringify(snakeCaseKeys(response)));
	} catch (error) {
		logger.error(error);

		const squawk = Squawk.isSquawk(error) ? error : Squawk.coerce(error);

		return createResponse(500, JSON.stringify(snakeCaseKeys(squawk)));
	}
};

function createResponse(statusCode: number, body?: string) {
	const response: APIGatewayProxyStructuredResultV2 = {
		statusCode,
		body: void 0,
		headers: {
			'content-type': 'application/json',
			'beak-time': (new Date()).toISOString(),
		},
	};

	if (body)
		response.body = body;

	return response;
}
