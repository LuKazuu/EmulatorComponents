// Tanpa Server CN
// Tanpa Cache
// Deploy CF Worker
const GITHUB_BASE = 'https://raw.githubusercontent.com/LuKazuu/EmulatorComponents/main';

const TYPE_TO_MANIFEST = {
	1: '/components/box64_manifest',
	2: '/components/drivers_manifest',
	3: '/components/dxvk_manifest',
	4: '/components/vkd3d_manifest',
};

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);

		const corsHeaders = {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type',
		};

		const noCacheHeaders = {
			'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0, s-maxage=0',
			'Pragma': 'no-cache',
			'Expires': '0',
		};

		const allHeaders = { ...corsHeaders, ...noCacheHeaders };

		if (request.method === 'OPTIONS') {
			return new Response(null, { headers: allHeaders });
		}

		const createStubResponse = (data = null, code = 200, msg = 'AeraCanoeV2') => {
			const time = Math.floor(Date.now() / 1000).toString();
			const responseBody = { code, msg, time, data };

			return new Response(JSON.stringify(responseBody), {
				headers: { 'Content-Type': 'application/json', ...allHeaders },
			});
		};

		const fetchFromGitHub = (pathname) => {
			const githubUrl = `${GITHUB_BASE}${pathname}`;
			return fetch(githubUrl, {
				cf: {
					cacheTtl: 0,
					cacheEverything: false,
				},
			});
		};

		try {
			if (url.pathname === '/simulator/executeScript' && request.method === 'POST') {
				const response = await fetchFromGitHub('/simulator/executeScript');
				if (!response.ok) return createStubResponse('Gagal mengambil data executeScript', 500);
				const data = await response.json();
				return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json', ...allHeaders } });
			}
			
			if (url.pathname === '/simulator/v2/getComponentList' && request.method === 'POST') {
				const body = await request.json();
				const type = body.type;
				const page = body.page || 1;
				const pageSize = body.page_size || 10;

				if (!type || !TYPE_TO_MANIFEST[type]) {
					return createStubResponse('Parameter tipe tidak valid', 400);
				}

				const manifestUrl = TYPE_TO_MANIFEST[type];
				const response = await fetchFromGitHub(manifestUrl);

				if (!response.ok) {
					return createStubResponse('Gagal mengambil manifest komponen', 500);
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
					const paginatedItems = allItems.slice(startIndex, endIndex);

					manifestData.data.list = paginatedItems;
					manifestData.data.page = page;
					manifestData.data.pageSize = pageSize;
					manifestData.data.total = total;
				}

				return new Response(JSON.stringify(manifestData), {
					headers: { 'Content-Type': 'application/json', ...allHeaders },
				});
			}

			if (url.pathname.startsWith('/simulator/v2/')) {
				const realPath = url.pathname.replace('/simulator/v2/', '/simulator/');
				const response = await fetchFromGitHub(realPath);
				
				if (response.ok) {
					return new Response(response.body, {
						status: response.status,
						headers: {
							...Object.fromEntries(response.headers),
							...allHeaders,
						},
					});
				} else {
					return createStubResponse('Gagal mengambil komponen dasar', 500);
				}
			}

			const githubResponse = await fetchFromGitHub(url.pathname);

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