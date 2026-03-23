<?php

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

if (!defined('BGENEROUS_SOFTR_API_TOKEN')) {
    define('BGENEROUS_SOFTR_API_TOKEN', 'replace-me');
}

if (!defined('BGENEROUS_SOFTR_DATABASE_ID')) {
    define('BGENEROUS_SOFTR_DATABASE_ID', '8e286317-79dc-492a-9438-b85df386149a');
}

if (!defined('BGENEROUS_SOFTR_BROKERS_TABLE_ID')) {
    define('BGENEROUS_SOFTR_BROKERS_TABLE_ID', '4vvP07assjejyj');
}

if (!function_exists('bgenerous_softr_config')) {
    function bgenerous_softr_config(): array
    {
        $apiToken = BGENEROUS_SOFTR_API_TOKEN !== 'replace-me'
            ? BGENEROUS_SOFTR_API_TOKEN
            : (string) getenv('BGENEROUS_SOFTR_API_TOKEN');

        $databaseId = BGENEROUS_SOFTR_DATABASE_ID !== 'replace-me'
            ? BGENEROUS_SOFTR_DATABASE_ID
            : (string) getenv('BGENEROUS_SOFTR_DATABASE_ID');

        $tableId = BGENEROUS_SOFTR_BROKERS_TABLE_ID !== 'replace-me'
            ? BGENEROUS_SOFTR_BROKERS_TABLE_ID
            : (string) getenv('BGENEROUS_SOFTR_BROKERS_TABLE_ID');

        return [
            'apiToken' => trim($apiToken),
            'databaseId' => trim($databaseId),
            'tableId' => trim($tableId),
        ];
    }
}

if (!function_exists('bgenerous_extract_field')) {
    function bgenerous_extract_field(array $fields, array $keys)
    {
        foreach ($keys as $key) {
            if (array_key_exists($key, $fields)) {
                return $fields[$key];
            }
        }

        return null;
    }
}

if (!function_exists('bgenerous_extract_string')) {
    function bgenerous_extract_string(array $fields, array $keys): string
    {
        $value = bgenerous_extract_field($fields, $keys);

        return is_string($value) ? trim($value) : '';
    }
}

if (!function_exists('bgenerous_extract_attachment_url')) {
    function bgenerous_extract_attachment_url($value): string
    {
        if (is_string($value)) {
            return trim($value);
        }

        if (!is_array($value)) {
            return '';
        }

        if (isset($value['url']) && is_string($value['url'])) {
            return trim($value['url']);
        }

        $first = $value[0] ?? null;

        if (is_array($first) && isset($first['url']) && is_string($first['url'])) {
            return trim($first['url']);
        }

        return '';
    }
}

if (!function_exists('bgenerous_extract_select_label')) {
    function bgenerous_extract_select_label($value): string
    {
        if (is_array($value) && isset($value['label']) && is_string($value['label'])) {
            return trim($value['label']);
        }

        return is_string($value) ? trim($value) : '';
    }
}

if (!function_exists('bgenerous_find_broker_by_referrer')) {
    function bgenerous_find_broker_by_referrer(string $referrerCode)
    {
        $config = bgenerous_softr_config();

        if ($config['apiToken'] === '' || $config['databaseId'] === '' || $config['tableId'] === '') {
            return new WP_Error('bgenerous_missing_config', 'Missing Softr configuration.', ['status' => 503]);
        }

        $url = sprintf(
            'https://tables-api.softr.io/api/v1/databases/%s/tables/%s/records?limit=200&fieldNames=true',
            rawurlencode($config['databaseId']),
            rawurlencode($config['tableId'])
        );

        $response = wp_remote_get($url, [
            'timeout' => 20,
            'headers' => [
                'Accept' => 'application/json',
                'Softr-Api-Key' => $config['apiToken'],
            ],
        ]);

        if (is_wp_error($response)) {
            return new WP_Error('bgenerous_softr_unavailable', 'Unable to reach Softr.', ['status' => 503]);
        }

        $statusCode = (int) wp_remote_retrieve_response_code($response);
        $body = json_decode((string) wp_remote_retrieve_body($response), true);

        if ($statusCode !== 200 || !is_array($body) || !is_array($body['data'] ?? null)) {
            return new WP_Error('bgenerous_softr_failed', 'Softr returned an unexpected response.', ['status' => 503]);
        }

        foreach ($body['data'] as $record) {
            $fields = $record['fields'] ?? null;
            if (!is_array($fields)) {
                continue;
            }

            $candidate = strtoupper(bgenerous_extract_string($fields, ['Public Ref Code', 'public_ref_code']));
            if ($candidate !== $referrerCode) {
                continue;
            }

            return [
                'id' => (string) ($record['id'] ?? ''),
                'referrerCode' => bgenerous_extract_string($fields, ['Public Ref Code', 'public_ref_code']),
                'companyName' => bgenerous_extract_string($fields, ['Company Name', 'company_name']),
                'description' => bgenerous_extract_string($fields, ['Company Description', 'company_description']),
                'logoUrl' => bgenerous_extract_attachment_url(bgenerous_extract_field($fields, ['Company Logo', 'company_logo'])),
                'source' => 'softr-tables-api',
                'status' => bgenerous_extract_select_label(bgenerous_extract_field($fields, ['Status', 'status'])),
            ];
        }

        return null;
    }
}

add_action('rest_api_init', static function (): void {
    register_rest_route('bgenerous/v1', '/broker', [
        'methods' => WP_REST_Server::READABLE,
        'permission_callback' => '__return_true',
        'callback' => static function (WP_REST_Request $request) {
            $referrerCode = strtoupper(trim((string) $request->get_param('referrer')));

            if ($referrerCode === '') {
                return new WP_REST_Response([
                    'ok' => false,
                    'message' => 'Missing referrer parameter.',
                ], 400);
            }

            $broker = bgenerous_find_broker_by_referrer($referrerCode);

            if (is_wp_error($broker)) {
                return new WP_REST_Response([
                    'ok' => false,
                    'message' => $broker->get_error_message(),
                ], (int) ($broker->get_error_data()['status'] ?? 503));
            }

            if ($broker === null) {
                return new WP_REST_Response([
                    'ok' => false,
                    'message' => 'Broker not found.',
                ], 404);
            }

            return new WP_REST_Response([
                'ok' => true,
                'broker' => $broker,
            ], 200);
        },
        'args' => [
            'referrer' => [
                'required' => true,
                'type' => 'string',
                'sanitize_callback' => static function ($value): string {
                    return strtoupper(trim((string) $value));
                },
            ],
        ],
    ]);
});
