/* A Node.js Module to inject middleware that validates the request header User token */

"use strict";
const jwt = require('jwt-simple');

/* Check for a token in the custom header setting and verify that it is signed and has not been tampered with. 
    If no header token is present, maybe the user The JWT Simple Package will throw exceptions
*/

module.exports.checkAuth = function(req, res, next) {

    if (req.headers['x-auth']) { // si se encuentra el campo x-auth en la cabecera sigo y verifico que sea correcto
        try {
            req.auth = jwt.decode(req.headers['x-auth'], process.env.JWT_SECRET);
            if (req.auth && req.auth.authorized && req.auth.userId) {
                return next();
            } else {
                return next(new Error('User is not logged in'));
            }
        } catch (err) { // Si se genera un error en el medio sigo y lo arrastro
            return next(err);
        }
    } else {
        return next(new Error('User is not logged in')); // si el campo no existe en la cabecera es porque nunca se genero, no esta logueado
    }
};