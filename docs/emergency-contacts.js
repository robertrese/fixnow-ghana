(function registerEmergencyContacts(root) {
  "use strict";

  const config = {
    version: "2026-08-08",
    updatePolicy: "approved-administrator-only",
    contacts: [
      {
        serviceId: "general-emergency",
        serviceName: "General emergency",
        primaryNumber: "112",
        alternativeNumbers: [],
        officialSourceUrl: "https://www.ghana.gov.gh/",
        officialAuthority: "Government of Ghana",
        lastVerifiedDate: "2026-08-08",
        verificationStatus: "verified",
        countryCoverage: "Ghana nationwide",
        active: true,
        displayOrder: 1
      },
      {
        serviceId: "police",
        serviceName: "Ghana Police Service",
        primaryNumber: "191",
        alternativeNumbers: ["112"],
        officialSourceUrl: "https://police.gov.gh/",
        officialAuthority: "Ghana Police Service",
        lastVerifiedDate: "2026-08-08",
        verificationStatus: "verified",
        countryCoverage: "Ghana nationwide",
        active: true,
        displayOrder: 2
      },
      {
        serviceId: "fire",
        serviceName: "Ghana National Fire Service",
        primaryNumber: "192",
        alternativeNumbers: ["112"],
        officialSourceUrl: "https://gnfs.gov.gh/",
        officialAuthority: "Ghana National Fire Service",
        lastVerifiedDate: "2026-08-08",
        verificationStatus: "verified",
        countryCoverage: "Ghana nationwide",
        active: true,
        displayOrder: 3
      },
      {
        serviceId: "ambulance",
        serviceName: "National Ambulance Service",
        primaryNumber: "112",
        alternativeNumbers: ["193"],
        officialSourceUrl: "https://nas.gov.gh/",
        officialAuthority: "National Ambulance Service, Ghana",
        lastVerifiedDate: "2026-08-08",
        verificationStatus: "verified",
        countryCoverage: "Ghana nationwide",
        active: true,
        displayOrder: 4
      }
    ]
  };

  root.FIXNOW_EMERGENCY_CONTACTS = Object.freeze(config);
  if (typeof module !== "undefined" && module.exports) module.exports = config;
})(typeof window !== "undefined" ? window : globalThis);
