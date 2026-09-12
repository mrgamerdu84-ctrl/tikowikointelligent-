package com.tikowiko.intelligent;

import android.Manifest;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.ContactsContract;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.text.Normalizer;
import java.util.Locale;

/**
 * Appels directs demandés explicitement par l'utilisateur.
 * La recherche du contact reste locale sur le téléphone.
 */
@CapacitorPlugin(
        name = "DirectCall",
        permissions = {
                @Permission(alias = "contacts", strings = { Manifest.permission.READ_CONTACTS }),
                @Permission(alias = "phone", strings = { Manifest.permission.CALL_PHONE })
        }
)
public class DirectCallPlugin extends Plugin {

    @PluginMethod
    public void callContact(PluginCall call) {
        String target = call.getString("target");
        if (target == null || target.trim().isEmpty()) {
            call.reject("Contact manquant");
            return;
        }

        if (getPermissionState("contacts") != PermissionState.GRANTED
                || getPermissionState("phone") != PermissionState.GRANTED) {
            requestPermissionForAliases(
                    new String[]{"contacts", "phone"},
                    call,
                    "callPermissionsCallback"
            );
            return;
        }

        performCall(call);
    }

    @PermissionCallback
    private void callPermissionsCallback(PluginCall call) {
        if (getPermissionState("contacts") != PermissionState.GRANTED
                || getPermissionState("phone") != PermissionState.GRANTED) {
            call.reject("Permissions Contacts et Téléphone nécessaires pour appeler directement");
            return;
        }
        performCall(call);
    }

    private void performCall(PluginCall call) {
        String requested = call.getString("target", "").trim();
        String number;
        String displayName;

        if (requested.matches("^[+0-9][0-9 .()\\-]{3,}$")) {
            number = requested.replaceAll("[^0-9+]", "");
            displayName = requested;
        } else {
            ContactMatch match = findContact(requested);
            if (match == null) {
                call.reject("Contact introuvable : " + requested);
                return;
            }
            if (match.ambiguous) {
                call.reject("Plusieurs contacts correspondent à " + requested + ". Dis le nom complet.");
                return;
            }
            number = match.number;
            displayName = match.name;
        }

        String emergencyCheck = number.replaceAll("[^0-9]", "");
        if (emergencyCheck.matches("^(112|15|17|18|114)$")) {
            call.reject("Pour un numéro d'urgence, utilise directement l'application Téléphone.");
            return;
        }

        try {
            Intent intent = new Intent(Intent.ACTION_CALL, Uri.fromParts("tel", number, null));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

            if (intent.resolveActivity(getContext().getPackageManager()) == null) {
                call.reject("Aucune application Téléphone compatible n'est disponible");
                return;
            }

            getContext().startActivity(intent);
            JSObject result = new JSObject();
            result.put("called", true);
            result.put("name", displayName);
            call.resolve(result);
        } catch (SecurityException e) {
            call.reject("Permission Téléphone refusée");
        } catch (Exception e) {
            call.reject("Impossible de lancer l'appel : " + e.getMessage());
        }
    }

    private ContactMatch findContact(String requested) {
        String target = normalizeName(requested);
        if (target.isEmpty()) return null;

        String[] projection = {
                ContactsContract.CommonDataKinds.Phone.CONTACT_ID,
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                ContactsContract.CommonDataKinds.Phone.NUMBER,
                ContactsContract.CommonDataKinds.Phone.TYPE
        };

        ContactMatch best = null;
        int bestScore = Integer.MAX_VALUE;
        long bestContactId = -1L;
        boolean ambiguous = false;

        try (Cursor cursor = getContext().getContentResolver().query(
                ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                projection,
                null,
                null,
                null
        )) {
            if (cursor == null) return null;

            int idIndex = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.CONTACT_ID);
            int nameIndex = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME);
            int numberIndex = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER);
            int typeIndex = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.TYPE);

            while (cursor.moveToNext()) {
                long contactId = cursor.getLong(idIndex);
                String name = cursor.getString(nameIndex);
                String number = cursor.getString(numberIndex);
                int type = cursor.getInt(typeIndex);
                if (name == null || number == null) continue;

                String candidate = normalizeName(name);
                int score;
                if (candidate.equals(target)) score = 0;
                else if (candidate.startsWith(target) || target.startsWith(candidate)) score = 1;
                else if (candidate.contains(target)) score = 2;
                else continue;

                if (score < bestScore) {
                    bestScore = score;
                    bestContactId = contactId;
                    best = new ContactMatch(name, number, type, false);
                    ambiguous = false;
                } else if (score == bestScore) {
                    if (contactId != bestContactId) {
                        ambiguous = true;
                    } else if (best != null
                            && best.type != ContactsContract.CommonDataKinds.Phone.TYPE_MOBILE
                            && type == ContactsContract.CommonDataKinds.Phone.TYPE_MOBILE) {
                        best = new ContactMatch(name, number, type, false);
                    }
                }
            }
        } catch (SecurityException e) {
            return null;
        }

        if (best == null) return null;
        best.ambiguous = ambiguous;
        return best;
    }

    private String normalizeName(String value) {
        String normalized = Normalizer.normalize(value == null ? "" : value, Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "")
                .toLowerCase(Locale.FRANCE)
                .replaceAll("[^a-z0-9 ]", " ")
                .replaceAll("\\s+", " ")
                .trim();
        return normalized;
    }

    private static class ContactMatch {
        final String name;
        final String number;
        final int type;
        boolean ambiguous;

        ContactMatch(String name, String number, int type, boolean ambiguous) {
            this.name = name;
            this.number = number;
            this.type = type;
            this.ambiguous = ambiguous;
        }
    }
}
