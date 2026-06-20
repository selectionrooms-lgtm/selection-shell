export async function onRequestPost(context) {
    const { env, request } = context;

    try {
        const formData = await request.formData();

        // Izvlačimo podatke iz forme
        const configText = formData.get("config");
        const subdomain = formData.get("subdomain") || "canvas";

        console.log("--- NOVI ZAHTEV ---");
        console.log("Subdomain:", subdomain);
        console.log("Config dužina karaktera:", configText ? configText.length : 0);

        if (!configText) {
            return new Response(JSON.stringify({ success: false, error: "Nema config podataka." }), { status: 400 });
        }

        // 1. ČUVANJE CONFIG-A U KV BAZU
        const kvKey = `${subdomain}:config`;
        await env.SELECTION_CONFIG_KV.put(kvKey, configText);

        // 2. ČUVANJE MEDIJA U R2 BUCKET
        let brojacFajlova = 0;

        for (const [key, value] of formData.entries()) {
            if (value && typeof value === "object" && value.name) {
                const file = value;
                brojacFajlova++;

                // ISPRAVLJENO: file.name iz forme već stiže kao "images/slika.jpg" ili "audio/pesma.mp3"
                // Sada ga pakujemo u izolovani folder tog korisnika: "lara/images/slika.jpg"
                const r2Path = `${subdomain}/${file.name}`;

                console.log(`Zapisujem na R2: ${r2Path} (${file.size} bajtova)`);

                const fileBuffer = await file.arrayBuffer();

                await env.SELECTION_MEDIA_R2.put(r2Path, fileBuffer, {
                    httpMetadata: { contentType: file.type }
                });
            }
        }

        console.log(`Uspešno upisano u KV. Ukupno fajlova gurnuto u R2: ${brojacFajlova}`);

        return new Response(JSON.stringify({ success: true, message: `Podaci sačuvani! Fajlova u R2: ${brojacFajlova}` }), {
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });

    } catch (err) {
        console.error("GREŠKA NA BACKENDU:", err.message);
        return new Response(JSON.stringify({ success: false, error: err.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}