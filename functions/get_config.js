export async function onRequest(context) {
    const { env, request } = context;

    // Čitamo parametre iz URL-a (npr. ?v=123 ili ?subdomain=canvas)
    const url = new URL(request.url);
    const subdomain = url.searchParams.get("subdomain") || "canvas";
    const kvKey = `${subdomain}:config`;

    try {
        // 1. Pokušaj da povučeš config iz KV baze za tog korisnika
        let configData = await env.SELECTION_CONFIG_KV.get(kvKey);

        if (configData) {
            return new Response(configData, {
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
            });
        }

        // 2. Ako nema u bazi, povuci podrazumevani config.json sa samog sajta (fallback)
        const fallbackUrl = `${url.origin}/admin/config.json`;
        const response = await fetch(fallbackUrl);
        if (response.ok) {
            const defaultConfig = await response.text();
            // Odmah ga upisujemo u KV da imamo za sledeći put
            await env.SELECTION_CONFIG_KV.put(kvKey, defaultConfig);
            return new Response(defaultConfig, {
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
            });
        }

        return new Response(JSON.stringify({ error: "Config not found" }), { status: 404 });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
}