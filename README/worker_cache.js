// Tanpa Server CN
// Dengan Cache
// Aera

const GITHUB_BASE = 'https://raw.githubusercontent.com/LuKazuu/EmulatorComponents/main';

const TYPE_TO_MANIFEST = {
	1: '/components/box64_manifest',
	2: '/components/drivers_manifest',
	3: '/components/dxvk_manifest',
	4: '/components/vkd3d_manifest',
	5: '/components/games_manifest',
	6: '/components/libraries_manifest',
	7: '/components/steam_manifest',
};

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);
		const cache = caches.default;

		const corsHeaders = {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type',
		};

		const cacheHeaders = {
			'Cache-Control': 'public, max-age=60',
		};

		const allHeaders = { ...corsHeaders, ...cacheHeaders };

		if (request.method === 'OPTIONS') {
			return new Response(null, { headers: corsHeaders });
		}

		const createStubResponse = (data = null, code = 200, msg = 'AeraCanoeV2') => {
			const time = Math.floor(Date.now() / 1000).toString();
			return new Response(JSON.stringify({ code, msg, time, data }), {
				headers: { 'Content-Type': 'application/json', ...allHeaders },
			});
		};

		const fetchFromGitHubCached = async (pathname) => {
			const githubUrl = `${GITHUB_BASE}${pathname}`;
			const cacheKey = new Request(githubUrl, request);
			
			let response = await cache.match(cacheKey);
			
			if (!response) {
				response = await fetch(githubUrl, {
					cf: {
						cacheTtl: 300,
						cacheEverything: true,
					},
				});
				
				if (response.ok) {
					response = new Response(response.body, response);
					response.headers.set('Cache-Control', 'public, max-age=300');
					ctx.waitUntil(cache.put(cacheKey, response.clone()));
				}
			}
			
			return response;
		};

		try {
			if (url.pathname === '/simulator/v2/getComponentList' && request.method === 'POST') {
				const body = await request.json();
				const type = body.type;
				const page = body.page || 1;
				const pageSize = body.page_size || 10;

				if (!type || !TYPE_TO_MANIFEST[type]) {
					return createStubResponse('Invalid type parameter', 400);
				}

				const response = await fetchFromGitHubCached(TYPE_TO_MANIFEST[type]);

				if (!response.ok) {
					return createStubResponse('Failed to fetch manifest', 500);
				}

				const manifestData = await response.json();

				if (manifestData.data && manifestData.data.components) {
					manifestData.data.list = manifestData.data.components;
					delete manifestData.data.components;
				}

				if (manifestData.data && manifestData.data.list) {
					const allItems = manifestData.data.list;
					const total = manifestData.data.total || allItems.length;
					const startIndex = (page - 1) * pageSize;
					const endIndex = startIndex + pageSize;
					
					manifestData.data.list = allItems.slice(startIndex, endIndex);
					manifestData.data.page = page;
					manifestData.data.pageSize = pageSize;
					manifestData.data.total = total;
				}

				return new Response(JSON.stringify(manifestData), {
					headers: { 'Content-Type': 'application/json', ...allHeaders },
				});
			}

			if (url.pathname === '/simulator/executeScript' && request.method === 'POST') {
				const response = await fetchFromGitHubCached('/simulator/executeScript');
				if (!response.ok) return createStubResponse('Failed to fetch executeScript', 500);
				const data = await response.json();
				return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json', ...allHeaders } });
			}

			if (url.pathname === '/game/getSteamHost' && request.method === 'GET') {
				const response = await fetchFromGitHubCached('/game/getSteamHost');
				if (!response.ok) return createStubResponse('Failed to fetch steam host', 500);
				const hostsText = await response.text();
				return new Response(hostsText, { headers: { 'Content-Type': 'text/plain', ...allHeaders } });
			}
			
			const githubResponse = await fetchFromGitHubCached(url.pathname);

			if (githubResponse.ok) {
				return new Response(githubResponse.body, {
					status: githubResponse.status,
					headers: {
						...Object.fromEntries(githubResponse.headers),
						...allHeaders,
					},
				});
			} else {
				return createStubResponse(null);
			}

		} catch (error) {
			return new Response(JSON.stringify({ code: 500, msg: `Internal Error: ${error.message}` }), {
				status: 500,
				headers: { 'Content-Type': 'application/json', ...allHeaders },
			});
		}
	},
};