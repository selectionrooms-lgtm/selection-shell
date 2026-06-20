// =========================================================================
// SELECTION SAAS MOTOR — app.js (Cloudflare Worker Ruter)
// =========================================================================

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        // Sredjujemo CORS zaglavlja da bi admin i canvas mogli da pričaju sa shell-om
        const corsHeaders = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Cf-Access-Authenticated-User-Email",
        };

        // 1. Rešavanje OPTIONS zahteva (CORS preflight)
        if (request.method === "OPTIONS") {
            return new Response(null, { headers: corsHeaders });
        }

        // ==========================================
        // RUTA 1: DOHVATANJE PODATAKA (GET /)
        // ==========================================
        if (request.method === "GET") {
            const subdomain = url.searchParams.get("subdomain");

            if (!subdomain) {
                return new Response(JSON.stringify({ error: "❌ Nedostaje subdomain parametar." }), {
                    status: 400,
                    headers: { "Content-Type": "application/json", ...corsHeaders }
                });
            }

            // Čitamo iz Cloudflare KV baze podataka
            const configData = await env.SELECTION_KV.get(subdomain.trim().toLowerCase());

            if (!configData) {
                return new Response(JSON.stringify({ error: `❌ Konfiguracija za '${subdomain}' nije pronađena.` }), {
                    status: 404,
                    headers: { "Content-Type": "application/json", ...corsHeaders }
                });
            }

            // Vraćamo čist JSON nazad u canvas.js
            return new Response(configData, {
                status: 200,
                headers: { "Content-Type": "application/json", ...corsHeaders }
            });
        }

        // ==========================================
        // RUTA 2: ČUVANJE I KREIRANJE KORISNIKA (POST /save_data)
        // ==========================================
        if (request.method === "POST" && url.pathname === "/save_data") {
            // Čitamo email koji nam Zero Trust prosledjuje nakon uspešnog PIN-a
            const adminEmail = request.headers.get('Cf-Access-Authenticated-User-Email');
            const TVOJ_MASTER_EMAIL = "selectionrooms@gmail.com"; // Tvoj jedinstveni master nalog

            try {
                const formData = await request.formData();
                const subdomain = formData.get('subdomain');
                const configData = formData.get('config_data');

                if (!subdomain || !configData) {
                    return new Response(JSON.stringify({ error: "❌ Nedostaju parametri: subdomain ili config_data." }), {
                        status: 400,
                        headers: { "Content-Type": "application/json", ...corsHeaders }
                    });
                }

                const cisceniSubdomain = subdomain.trim().toLowerCase();

                // Proveravamo da li klijent već ima otvoren nalog u bazi
                const postojeciConfig = await env.SELECTION_KV.get(cisceniSubdomain);

                // Ako poddomen NE POSTOJI, znači da se pokreće Master forma za novog klijenta
                if (!postojeciConfig) {
                    // Ako neko pokuša da prođe bez tvog email-a, spuštamo rampu
                    if (adminEmail !== TVOJ_MASTER_EMAIL) {
                        return new Response(JSON.stringify({ error: "⛔ Nemate Master Admin prava za kreiranje novih klijenata." }), {
                            status: 403,
                            headers: { "Content-Type": "application/json", ...corsHeaders }
                        });
                    }
                    console.log(`👑 Master Admin (${adminEmail}) uspešno pokrenuo novi prostor: ${cisceniSubdomain}`);
                }

                // Upisujemo ili ažuriramo podatke u KV bazi
                await env.SELECTION_KV.put(cisceniSubdomain, configData);

                return new Response(JSON.stringify({ success: true, message: `Uspešno upisano u KV za ${cisceniSubdomain}` }), {
                    status: 200,
                    headers: { "Content-Type": "application/json", ...corsHeaders }
                });

            } catch (error) {
                return new Response(JSON.stringify({ error: "Interna greška servera: " + error.message }), {
                    status: 500,
                    headers: { "Content-Type": "application/json", ...corsHeaders }
                });
            }
        }

        // Ako neko pogodi nepostojeću rutu ili metodu
        return new Response(JSON.stringify({ error: "Ruta nije pronađena." }), {
            status: 404,
            headers: { "Content-Type": "application/json", ...corsHeaders }
        });
    },
};