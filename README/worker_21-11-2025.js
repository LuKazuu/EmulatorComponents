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

		const createStubResponse = (data = null, code = 200, msg = 'AeraCanoeV2', realHttpStatus = 200) => {
			const time = Math.floor(Date.now() / 1000).toString();
			const responseBody = { code, msg, time, data };

			return new Response(JSON.stringify(responseBody), {
				status: realHttpStatus,
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
			// 0. Health Check
			if (url.pathname === '/') {
				return createStubResponse(); 
			}
			
			// 1. Handle executeScript
			if (url.pathname === '/simulator/executeScript' && request.method === 'POST') {
				const response = await fetchFromGitHub('/simulator/executeScript');
				if (!response.ok) {
					console.error('[EXEC_FAIL] Gagal mengambil script utama dari GitHub');
					return createStubResponse(null, 500, 'Fetch Error');
				}
				const data = await response.json();
				return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json', ...allHeaders } });
			}

            // 2. Handle getComponentDetail
            if (url.pathname === '/simulator/v2/getComponentDetail') {
                let id;
                if (request.method === 'GET') {
                    id = parseInt(url.searchParams.get('id'));
                } else {
                    try {
                        const body = await request.json();
                        id = body.id;
                    } catch (e) {
                        return createStubResponse(null, 400, 'Invalid Body');
                    }
                }

                if (!id) {
                    return createStubResponse(null, 400, 'Missing ID parameter');
                }

                const manifestKeys = Object.keys(TYPE_TO_MANIFEST);
                const fetchPromises = manifestKeys.map(key => 
                    fetchFromGitHub(TYPE_TO_MANIFEST[key])
                        .then(res => res.ok ? res.json() : null)
                        .catch(() => null)
                );

                const manifests = await Promise.all(fetchPromises);
                let foundItem = null;

                for (const manifest of manifests) {
                    if (manifest && manifest.data && manifest.data.components) {
                        const match = manifest.data.components.find(c => c.id == id);
                        if (match) {
                            foundItem = match;
                            break; 
                        }
                    }
                }

                if (foundItem) {
                    return createStubResponse(foundItem);
                } else {
                    console.error(`[DETAIL_FAIL] Component ID ${id} not found in any manifest`);
                    return createStubResponse(null, 404, 'Component Not Found');
                }
            }
			
			// 3. Handle API getComponentList
			if (url.pathname === '/simulator/v2/getComponentList' && (request.method === 'POST' || request.method === 'GET')) {
				let type, page, pageSize;

				if (request.method === 'POST') {
                    try {
                        const body = await request.json();
                        type = body.type;
                        page = body.page || 1;
                        pageSize = body.page_size || 10;
                    } catch(e) { type = 0; }
				} else {
                    type = parseInt(url.searchParams.get('type'));
                    page = parseInt(url.searchParams.get('page')) || 1;
                    pageSize = parseInt(url.searchParams.get('page_size')) || 10;
                }

				if (!type || !TYPE_TO_MANIFEST[type]) {
					console.warn(`[API_WARN] Tipe komponen tidak valid: ${type}`);
					return createStubResponse(null, 400, 'Invalid Type');
				}

				const manifestUrl = TYPE_TO_MANIFEST[type];
				const response = await fetchFromGitHub(manifestUrl);

				if (!response.ok) {
					console.error(`[API_FAIL] Gagal mengambil manifest: ${manifestUrl}`);
					return createStubResponse(null, 500, 'Fetch Error');
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

			// 4. Handle V2 Rewrite
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
					console.warn(`[V2_MISSING] File tidak ditemukan: ${realPath}`);
					return createStubResponse(null, 404, 'Not Found');
				}
			}

			// 5. Handle Other Requests
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
				console.warn(`[OTHER_MISSING] File tidak ditemukan: ${url.pathname}`);
				return createStubResponse(null, 404, 'Not Found');
			}

		} catch (error) {
			console.error(`[INTERNAL_ERROR] ${error.message}`);
			return createStubResponse(null, 500, `Internal Error: ${error.message}`, 500);
		}
	},
};