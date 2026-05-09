import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,OPTIONS,PATCH,DELETE,POST,PUT"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version"
  );

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  try {
    const { action, articleContent, articleTitle } = req.body;

    if (!action) {
      return res.status(400).json({ error: "Action parameter required" });
    }

    if (action === "generate") {
      if (!articleTitle || !articleContent) {
        return res.status(400).json({
          error: "articleTitle and articleContent are required",
        });
      }

      const message = await client.messages.create({
        model: "claude-opus-4-20250805",
        max_tokens: 1500,
        messages: [
          {
            role: "user",
            content: `Convert this English news article to Gujarati. Return ONLY valid JSON (no markdown, no extra text):

Title: ${articleTitle}
Content: ${articleContent.substring(0, 2000)}

Return this exact JSON format:
{
  "gujaratiTitle": "ગુજરાતી શીર્ષક",
  "gujaratiContent": "ગુજરાતી લેખ સામગ્રી અહીં આવશે...",
  "keywords": "keyword1, keyword2, keyword3",
  "metaDescription": "SEO description",
  "slug": "english-slug-format"
}`,
          },
        ],
      });

      try {
        const responseText = message.content[0].text;
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);

        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return res.status(200).json({
            success: true,
            ...parsed,
          });
        }

        return res.status(200).json({
          success: true,
          gujaratiTitle: articleTitle,
          gujaratiContent: articleContent,
          keywords: "article, news",
          metaDescription: articleContent.substring(0, 160),
          slug: "article",
        });
      } catch (parseError) {
        return res.status(200).json({
          success: true,
          gujaratiTitle: articleTitle,
          gujaratiContent: articleContent,
          keywords: "article, news",
          metaDescription: articleContent.substring(0, 160),
          slug: "article",
        });
      }
    }

    if (action === "publish") {
      const { gujaratiTitle, gujaratiContent, keywords, metaDescription, slug } =
        req.body;

      if (!gujaratiTitle || !gujaratiContent) {
        return res.status(400).json({
          error: "gujaratiTitle and gujaratiContent required for publishing",
        });
      }

      const WORDPRESS_PASSWORD = process.env.WORDPRESS_PASSWORD;
      const WORDPRESS_URL = process.env.WORDPRESS_URL || "https://gujaratmirror.in";
      const WORDPRESS_USER = process.env.WORDPRESS_USER || "admin";

      if (!WORDPRESS_PASSWORD) {
        return res.status(500).json({
          error: "WordPress credentials not configured. Check environment variables.",
        });
      }

      const auth = Buffer.from(`${WORDPRESS_USER}:${WORDPRESS_PASSWORD}`).toString(
        "base64"
      );

      const postData = {
        title: gujaratiTitle,
        content: gujaratiContent,
        excerpt: metaDescription || gujaratiContent.substring(0, 160),
        slug: slug || "article",
        status: "publish",
      };

      const response = await fetch(`${WORDPRESS_URL}/wp-json/wp/v2/posts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${auth}`,
        },
        body: JSON.stringify(postData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        return res.status(response.status).json({
          success: false,
          error: errorData.message || `WordPress API error: ${response.statusText}`,
        });
      }

      const result = await response.json();
      return res.status(200).json({
        success: true,
        postId: result.id,
        url: result.link,
        message: "Article published successfully",
      });
    }

    return res.status(400).json({
      error: "Invalid action. Use 'generate' or 'publish'.",
    });
  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Internal server error",
    });
  }
}
