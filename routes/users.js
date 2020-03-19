const express = require('express')
const bcrypt = require('bcryptjs')
const async = require('async')
const joi = require('joi') // For data validation
const authHelper = require('./authHelper')
const ObjectId = require('mongodb').ObjectID


const router = express.Router()

// Crea un usuario
router.post('/', function postUser(req, res, next) {
    // Password must be 7 to 15 characters in length and contain at least one
    // numeric digit and a special character
    const schema = {
        displayName: joi.string().alphanum().min(3).max(50).required(),
        email: joi.string().email().min(7).max(50).required(),
        password: joi.string().regex(/^(?=.*[0-9])(?=.*[!@#$%^&*])[a-zA-Z0-9!@#$%^&*] { 7, 15 }$/).required()
    };

    joi.validate(req.body, schema, function(err, value) {
        if (err)
            return next(new Error('Invalid field: display name 3 to 50 alphanumeric, valid email, password 7 to 15(one number, one special character)'));

        req.db.collection.findOne({ type: 'USER_TYPE', email: req.body.email }, function(err, doc) {

            if (err)
                return next(err);

            if (doc)
                return next(new Error('Email account already registered'));

            const xferUser = {
                type: 'USER_TYPE',
                displayName: req.body.displayName,
                email: req.body.email,
                passwordHash: null,
                date: Date.now(),
                completed: false,
                settings: {
                    requireWIFI: true,
                    enableAlerts: false
                },
                newsFilters: [{
                    name: 'Technology Companies',
                    keyWords: ['Apple', 'Microsoft', 'IBM', 'Amazon', 'Google', 'Intel'],
                    enableAlert: false,
                    alertFrequency: 0,
                    enableAutoDelete: false,
                    deleteTime: 0,
                    timeOfLastScan: 0,
                    newsStories: []
                }],
                savedStories: []
            };

            bcrypt.hash(req.body.password, 10, function getHash(err, hash) {
                if (err)
                    return next(err);

                xferUser.passwordHash = hash;

                req.db.collection.insertOne(xferUser, function createUser(err, result) {
                    if (err)
                        return next(err);

                    req.node2.send({ msg: 'REFRESH_STORIES', doc: result.ops[0] });

                    res.status(201).json(result.ops[0]);
                });
            });
        });
    });
});

// Elimina un usuario
router.delete('/:id', authHelper.checkAuth, (req, res, next) => {
    // verify that the passed in id to delete is the same as that in the auth token
    if (req.params.id != req.auth.userID)
        return next(new Error('Invalid request for account deletion'));

    // MongoDB should do the work of queuing this up and retrying if there is a conflict, According to this documentation
    // This requires a write lock on their part
    req.db.collection.findOneAndDelete({ type: 'USER-TYPE', _id: ObjectId(req.auth.userID) }, function(err, result) {

        if (err) {
            console.log('POSIBLE USER DELETION CONTENTION? err:', err);
            return next(err);
        } else if (result.ok != 1) {
            console.log('POSSIBLE USER DELETION ERROR? result:', result);
            return next(new Errror('Account deletion failure'));
        }

        res.status(200).json({ msg: "User Deleted" });
    });
});

// Muestra un usuario
router.get('/:id', authHelper.checkAuth, function(req, res, next) {
    // Verify that the passed in id to delete is the same the auth token
    if (req.params.id != req.auth.userId)
        return next(new Error('Invalid request for account fetch'));

    req.db.collection.findOne({ type: 'USER_TYPE', _id: ObjectId(req.auth.userId) }, function(err, doc) {
        if (err) return next(err);

        var xferProfile = {
            email: doc.email,
            displayName: doc.displayName,
            date: doc.date,
            settings: doc.settings,
            newsFilters: doc.newsFilters,
            savedStories: doc.savedStories
        };

        res.header("Cache-Control", "no-cache, no-store, must-revalidate");
        res.header("Pragma", "no-cache");
        res.header("Expires", 0);
        res.status(200).json(xferProfile);
    });
});

// Actualiza un usuario
router.put('/:id', authHelper.checkAuth, function(req, res, next) {
    // Verify that the passed in id is the same as that in the auth token
    if (req.params.id != req.auth.userId)
        return next(new Error('Invalid request for account deletion'));

    // Limit the number of newsFilters
    if (req.body.newsFilters.length > process.env.MAX_FILTERS)
        return next(new Error('Too many news newsFilters'));

    // clear out leading and trailing spaces
    for (var i = 0; i < req.body.newsFilters.length; i++) {
        if ("keyWords" in req.body.newsFilters[i] && req.body.newsFilters[i].keyWords[0] != "") {
            for (var j = 0; j < req.body.newsFilters[i].keyWords.length; j++) {
                req.body.newsFilters[i].keyWords[j] = req.body.newsFilters[i].keyWords[j].trim();
            }
        }
    }

    // Validate the newsFilters
    const schema = {
        name: joi.string().min(1).max(30).regex(/^[-_ a-zA-Z0-9]+$/).required(),
        keyWords: joi.array().max(10).items(joi.string().max(20)).required(),
        enableAlert: joi.boolean(),
        alertFrequency: joi.number().min(0),
        enableAutoDelete: joi.boolean(),
        deleteTime: joi.date(),
        timeOfLastScan: joi.date(),
        newsStories: joi.array(),
        keywordsStr: joi.string().min(1).max(100)
    };

    async.eachSeries(req.body.newsFilters, function(filter, innercallback) {
        joi.validate(filter, schema, function(err) {
            innercallback(err);
        });
    }, function(err) {
        if (err) {
            return next(err);
        } else {
            // MongoDB implements optimistic concurrency for us.
            // We were not holding on to the document anyway, so we just do a
            // quick read and replace of just those properties and not the
            // complete document.
            // It matters if news stories were updated in the mean time (i.e.
            // user sat there taking their time updating their news profile)
            // because we will force that to update as part of this operation.
            // We need the {returnOriginal: false}, so a test could verify what
            // happened, otherwise the default is to return the original.
            req.db.collection.findOneAndUpdate({
                    type: 'USER_TYPE',
                    _id: ObjectId(req.auth.userId)
                }, {
                    $set: {
                        settings: {
                            requireWIFI: req.body.requireWIFI,
                            enableAlerts: req.body.enableAlerts
                        },
                        newsFilters: req.body.newsFilters
                    }
                }, { returnOriginal: false },
                function(err, result) {
                    if (err) {
                        console.log("+++POSSIBLE USER PUT CONTENTION ERROR?+++ err:",
                            err);
                        return next(err);
                    } else if (result.ok != 1) {
                        console.log("+++POSSIBLE CONTENTION ERROR?+++ result:",
                            result);
                        return next(new Error('User PUT failure'));
                    }
                    req.node2.send({ msg: 'REFRESH_STORIES', doc: result.value });
                    res.status(200).json(result.value);
                });
        }
    });
})

// Guarda una historia
router.post('/:id/savedstories', authHelper.checkAuth, function(req, res, next) {

    // Verify that the id to delete is the same as in the auth token
    if (req.params.id != req.auth.userId)
        return next(new Error('Invalid request for saving story'));

    // Validate the body
    const schema = {
        contentSnippet: joi.string().max(200).required(),
        date: joi.date().required(),
        hours: joi.string().max(20),
        imageUrl: joi.string().max(300).required(),
        keep: joi.boolean().required(),
        link: joi.string().max(300).required(),
        source: joi.string().max(50).required(),
        storyID: joi.string().max(100).required(),
        title: joi.string().max(200).required()
    };

    joi.validate(req.body, schema, function(err) {
        if (err)
            return next(err);
        // make sure:
        // A. Story is not already in there.
        // B. We limit the number of saved stories to 30
        // Not allowed at free tier!!!
        // req.db.collection.findOneAndUpdate({ type: 'USER_TYPE',
        // _id: ObjectId(req.auth.userId),
        // $where: 'this.savedStories.length<29' },
        req.db.collection.findOneAndUpdate({
                type: 'USER_TYPE',
                _id: ObjectId(req.auth.userId)
            }, { $addToSet: { savedStories: req.body } }, { returnOriginal: true },
            function(err, result) {
                if (result && result.value == null) {
                    return next(new Error('Over the save limit,or story already saved '));
                } else if (err) {
                    console.log("+++POSSIBLE CONTENTION ERROR?+++ err:", err);
                    return next(err);
                } else if (result.ok != 1) {
                    console.log("+++POSSIBLE CONTENTION ERROR?+++ result:", result);
                    return next(new Error('Story save failure'));
                }
                res.status(200).json(result.value);
            });
    });
});


// Elimina una historia
router.delete('/:id/savedstories/:sid', authHelper.checkAuth, function(req, res, next) {
    if (req.params.id != req.auth.userId)
        return next(new Error('Invalid request for deletion of saved story'));

    req.db.collection.findOneAndUpdate({
            type: 'USER_TYPE',
            _id: ObjectId(req.auth.userId)
        }, { $pull: { savedStories: { storyID: req.params.sid } } }, { returnOriginal: true },
        function(err, result) {
            if (err) {
                console.log("+++POSSIBLE CONTENTION ERROR?+++ err:", err);
                return next(err);
            } else if (result.ok != 1) {
                console.log("+++POSSIBLE CONTENTION ERROR?+++ result:", result);
                return next(new Error('Story delete failure'));
            }
            res.status(200).json(result.value);
        });
});


module.exports = router