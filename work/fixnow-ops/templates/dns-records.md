# DNS Records Template

Generated: June 21, 2026

Replace the example IP with the server public IP.

| Host | Type | Value | Notes |
| --- | --- | --- | --- |
| `api.fixnowghana.org` | A | `203.0.113.10` | Backend API server |
| `www.fixnowghana.org` | CNAME | `fixnowghana.org` | Public website, optional |
| `app.fixnowghana.org` | A or CNAME | hosting provider value | Web app, optional |

After records are created, confirm:

```bash
dig api.fixnowghana.org
curl -I http://api.fixnowghana.org
```
