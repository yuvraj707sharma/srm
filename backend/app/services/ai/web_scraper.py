import json
import logging
import asyncio
import re
from typing import List, Dict, Any

from google import genai
from google.genai import types

from app.core.config import settings

logger = logging.getLogger(__name__)


class WebScraperService:
    """
    Uses Gemini with Google Search Grounding to discover external medical suppliers.
    NOTE: google_search tool is incompatible with response_mime_type="application/json".
    We use plain text output and parse JSON from the response ourselves.
    """

    def __init__(self):
        api_key = settings.GEMINI_API_KEY
        if api_key:
            self._client = genai.Client(api_key=api_key)
        else:
            self._client = None
            logger.warning("GEMINI_API_KEY is not configured. Web scraper service will be disabled.")
        self._model_name = settings.GEMINI_MODEL

    async def search_external_vendors(self, query: str, country: str = None, state: str = None, city: str = None) -> List[Dict[str, Any]]:
        """
        Uses Google Search Grounding to find real external vendors, with optional location filters.
        Returns a list of vendor dicts with full contact details.
        """
        if not self._client:
            logger.warning("GEMINI_API_KEY is missing. Skipping live web discovery.")
            return []
        location_clause = ""
        if country or state or city:
            locs = [l for l in (city, state, country) if l]
            loc_str = ", ".join(locs)
            location_clause = f"\nCRITICAL: You MUST ONLY return suppliers that are physically located or headquartered in: {loc_str}. Do NOT return suppliers outside of {loc_str}.\n"
        else:
            location_clause = "\nGEOGRAPHIC SCOPE: The scope is GLOBAL (Worldwide). Research and return legitimate manufacturers, suppliers, and OEMs across major industrial hubs worldwide.\n"

        prompt = f"""You are SupplySphere AI — an expert supply chain and procurement intelligence analyst.

TASK: Research and identify 20 legitimate, real-world manufacturers, OEMs, and suppliers for the following product/component requirement:

"{query}"
{location_clause}
For EACH supplier you find, provide ALL of the following in a structured JSON format. Only include REAL companies with verifiable web presence. Do NOT fabricate or hallucinate any company names, URLs, or contact details.

Return a JSON array where each object has:
{{
  "companyName": "Exact legal/trading company name",
  "legalName": "Official registered legal entity name if different",
  "website": "Official company website URL (must be a real, live domain)",
  "description": "2-3 sentence description of what they manufacture and their specialization",
  "headquarters": "City, Country",
  "contact": {{
    "generalEmail": "General inquiry email from their website (e.g. info@company.com)",
    "salesEmail": "Sales/procurement email if available",
    "phone": "Main phone number with country code",
    "address": "Full street address of HQ",
    "city": "City",
    "country": "Country",
    "rfqPortalUrl": "URL to their RFQ/quote request page if available",
    "linkedinUrl": "Company LinkedIn page URL",
    "keyExecutive": "CEO or President name",
    "keyExecutiveTitle": "Their title"
  }},
  "market": {{
    "tier": "One of: Tier 1 (Global Leader) | Tier 2 (Major Player) | Tier 3 (Regional/Niche) | Tier 4 (Emerging/Startup)",
    "estimatedRevenue": "One of: $10B+ | $1B - $10B | $500M - $1B | $100M - $500M | $10M - $100M | $1M - $10M | Under $1M",
    "marketShareEstimate": "Approximate market share percentage or description",
    "majorClients": ["List of well-known client companies"],
    "foundedYear": 1990,
    "employeeCountEstimate": "e.g. 5,000-10,000",
    "stockTicker": "Exchange:TICKER if publicly traded, null otherwise"
  }},
  "capabilities": {{
    "coreProducts": ["List of main products relevant to the query"],
    "manufacturingProcesses": ["e.g. CNC Machining, Injection Molding, etc."],
    "materials": ["Materials they work with"],
    "moqMin": "Minimum order quantity",
    "leadTimeWeeks": "Typical lead time in weeks",
    "tolerances": "Manufacturing tolerances if applicable",
    "annualCapacity": "Annual production capacity estimate",
    "manufacturingLocations": ["City, Country of each facility"],
    "certifications": [
      {{"name": "ISO 9001:2015", "category": "quality"}},
      {{"name": "IATF 16949", "category": "automotive"}}
    ]
  }},
  "risk": {{
    "geopoliticalRiskScore": 25,
    "financialStabilityRating": "One of: Strong | Moderate | Weak | Unknown",
    "sanctionCheck": "One of: Clear | Flagged | Unknown",
    "esgRating": "If known, e.g. A, B+",
    "supplyChainVulnerability": 30,
    "complianceFlags": ["e.g. REACH Compliant, RoHS Compliant"],
    "riskNotes": "Any relevant risk notes"
  }},
  "sourceUrls": ["URL1 where you found this info", "URL2", "URL3"]
}}

CRITICAL RULES:
1. Only return REAL, existing companies. If you are not confident a company exists, do not include it.
2. Every URL must be a real, navigable web address.
3. Include a mix of market tiers (global leaders AND mid-size/niche players).
4. sourceUrls MUST contain real web pages where the company information can be verified.
5. Return ONLY the JSON array of exactly 20 objects. No markdown fencing, no explanations.
"""

        loop = asyncio.get_running_loop()
        try:
            response_text = await loop.run_in_executor(None, self._sync_call, prompt)
            return self._parse_response(response_text)
        except Exception as e:
            logger.error("Error scraping external vendors for '%s': %s", query, e)
            return []

    def _sync_call(self, prompt: str) -> str:
        """Call Gemini with Google Search grounding with automatic 503 spike retries."""
        import time
        max_retries = 3
        for attempt in range(max_retries):
            try:
                response = self._client.models.generate_content(
                    model=self._model_name,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        tools=[types.Tool(google_search=types.GoogleSearch())],
                        temperature=0.2,
                    ),
                )
                if not response.text or not response.text.strip():
                    raise Exception("Empty response from Gemini web search")
                return response.text
            except Exception as e:
                err_str = str(e)
                if ("503" in err_str or "UNAVAILABLE" in err_str or "high demand" in err_str) and attempt < max_retries - 1:
                    logger.warning("Gemini 503 high demand spike on %s. Retrying attempt %d/%d in 2s...", self._model_name, attempt + 1, max_retries)
                    time.sleep(2 * (attempt + 1))
                else:
                    raise

    def _parse_response(self, text: str) -> List[Dict[str, Any]]:
        """Extract JSON array from Gemini plain-text response."""
        # Strip markdown fences if present
        text = text.strip()
        text = re.sub(r"^```json\s*", "", text)
        text = re.sub(r"^```\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
        text = text.strip()

        # Try direct parse first
        try:
            data = json.loads(text)
            if isinstance(data, list):
                return data
            if isinstance(data, dict):
                for key in ("vendors", "companies", "results", "suppliers"):
                    if key in data and isinstance(data[key], list):
                        return data[key]
                return [data]
        except json.JSONDecodeError:
            pass

        # Fallback: extract first JSON array from text
        match = re.search(r"(\[.*\])", text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(1))
            except json.JSONDecodeError:
                pass

        logger.warning("Could not parse JSON from Gemini web search response")
        return []
