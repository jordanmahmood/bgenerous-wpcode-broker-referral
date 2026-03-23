# BGenerous WPCode Broker Referral

## Paste Into WPCode

- `wpcode-referral-loader.js`
  Use as a `JavaScript Snippet`

- `wpcode-broker-endpoint-loader.php`
  Use as a `PHP Snippet`

- `branded-form-banner.css`
  Use as a `CSS Snippet`

- `branded-form-banner.html`
  Paste into the one branded form page as the static HTML block

## Runtime Files

- `bgenerous-referral-runtime.js`
  The sitewide browser runtime fetched by the JS loader

- `bgenerous-broker-endpoint.php`
  The WordPress REST endpoint implementation fetched by the PHP loader

## WordPress Constants

Define these in `wp-config.php` if possible:

```php
define('BGENEROUS_SOFTR_API_TOKEN', 'replace-me');
define('BGENEROUS_SOFTR_DATABASE_ID', '8e286317-79dc-492a-9438-b85df386149a');
define('BGENEROUS_SOFTR_BROKERS_TABLE_ID', '4vvP07assjejyj');
```
