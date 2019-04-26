const countryTable = [
    { code: "AU", domain: "com.au", language: "en" },
    { code: "AT", domain: "at", language: "de" },
    { code: "BE", domain: "be", language: "fr" },
    { code: "BR", domain: "com.br", language: "pt" },
    { code: "CA", domain: "ca", language: "en" },
    { code: "CN", domain: "com.cn", language: "zh" },
    { code: "CZ", domain: "cz", language: "cs" },
    { code: "DK", domain: "dk", language: "da" },
    { code: "FI", domain: "fi", language: "fi" },
    { code: "FR", domain: "fr", language: "fr" },
    { code: "DE", domain: "de", language: "de" },
    { code: "IE", domain: "ie", language: "en" },
    { code: "IT", domain: "it", language: "it" },
    { code: "MX", domain: "mx", language: "es" },
    { code: "NL", domain: "nl", language: "nl" },
    { code: "NZ", domain: "co.nz", language: "en" },
    { code: "PH", domain: "com.ph", language: "en" },
    { code: "PL", domain: "pl", language: "pl" },
    { code: "RU", domain: "ru", language: "ru" },
    { code: "SK", domain: "sk", language: "sk" },
    { code: "ES", domain: "es", language: "es" },
    { code: "SE", domain: "se", language: "sv" },
    { code: "GB", domain: "co.uk", language: "en" },
    { code: "US", domain: "com", language: "en" }
]

module.exports = {

    getRegion: function (code) {
        return countryTable.filter(o => o.code.toLowerCase() == code.toLowerCase())[0]
    }

}
