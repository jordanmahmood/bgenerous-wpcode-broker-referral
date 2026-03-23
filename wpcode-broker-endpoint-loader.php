<?php

declare(strict_types=1);

(function (): void {
    if (!function_exists('wp_remote_get')) {
        return;
    }

    $sourceUrl = 'https://raw.githubusercontent.com/jordanmahmood/bgenerous-wpcode-broker-referral/main/bgenerous-broker-endpoint.php';
    $cacheKey = 'bgenerous_wpcode_endpoint_source_v1';
    $cacheTtl = 300;
    $source = function_exists('get_transient') ? get_transient($cacheKey) : false;

    if (!is_string($source) || trim($source) === '') {
        $response = wp_remote_get(add_query_arg('v', (string) time(), $sourceUrl), [
            'timeout' => 20,
            'headers' => [
                'Cache-Control' => 'no-cache',
                'Pragma' => 'no-cache',
            ],
        ]);

        if (!is_wp_error($response) && (int) wp_remote_retrieve_response_code($response) === 200) {
            $body = (string) wp_remote_retrieve_body($response);

            if (trim($body) !== '') {
                $source = $body;

                if (function_exists('set_transient')) {
                    set_transient($cacheKey, $source, $cacheTtl);
                }
            }
        }
    }

    if (!is_string($source) || trim($source) === '') {
        error_log('BGenerous WPCode PHP loader failed to load GitHub source.');
        return;
    }

    eval('?>' . $source);
})();
