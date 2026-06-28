<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

class SetDbSessionContext
{
    public function handle(Request $request, Closure $next): Response
    {
        /** @var User|null $user */
        $user = Auth::guard('sanctum')->user();

        $userId = (string) ($user !== null ? $user->id : 0);
        $role = $user !== null ? ($user->role ?? 'guest') : 'guest';
        $locationIds = $user !== null && $user->location_id !== null
            ? json_encode([$user->location_id])
            : '[]';

        // Capture previous values so we can restore them (supports nested/test contexts).
        $prev = DB::selectOne("
            SELECT
                current_setting('app.user_id', true)    AS user_id,
                current_setting('app.role', true)        AS role,
                current_setting('app.location_ids', true) AS location_ids
        ");

        try {
            DB::statement('SELECT set_config(?, ?, false)', ['app.user_id', $userId]);
            DB::statement('SELECT set_config(?, ?, false)', ['app.role', $role]);
            DB::statement('SELECT set_config(?, ?, false)', ['app.location_ids', $locationIds]);

            return $next($request);
        } finally {
            try {
                // Restore to whatever was set before this request (empty string → RESET).
                if ($prev->user_id !== null && $prev->user_id !== '') {
                    DB::statement('SELECT set_config(?, ?, false)', ['app.user_id', $prev->user_id]);
                } else {
                    DB::unprepared('RESET app.user_id');
                }

                if ($prev->role !== null && $prev->role !== '') {
                    DB::statement('SELECT set_config(?, ?, false)', ['app.role', $prev->role]);
                } else {
                    DB::unprepared('RESET app.role');
                }

                if ($prev->location_ids !== null && $prev->location_ids !== '') {
                    DB::statement('SELECT set_config(?, ?, false)', ['app.location_ids', $prev->location_ids]);
                } else {
                    DB::unprepared('RESET app.location_ids');
                }
            } catch (\Throwable) {
                // Connection may be closed or in error state
            }
        }
    }
}
