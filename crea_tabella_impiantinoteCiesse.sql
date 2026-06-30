CREATE TABLE `impiantinoteCiesse` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `idimpianto` int(11) NOT NULL,
  `noteimpianto` varchar(255) NOT NULL,
  `libero` int(11) DEFAULT NULL,
  `visto` tinyint(1) DEFAULT '0',
  `data_modifica` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=240 DEFAULT CHARSET=latin1;